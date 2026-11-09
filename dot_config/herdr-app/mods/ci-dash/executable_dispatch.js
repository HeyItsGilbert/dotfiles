// The Dispatch tab: pick a workflow, a branch and its `workflow_dispatch`
// inputs, review, then start the run. Mirrors the TUI plugin's four steps.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { settings } from "herdr";
import { GhError } from "./gh.js";
import { parseWorkflowInputs } from "./workflow-inputs.js";
import { mapLimit, relTime, stateOf } from "./format.js";
import { icon, tint, pill, section, searchBox, busy, iconTile, segmented, stepper } from "./ui.js";

const mono = () => settings().font_family ?? "JetBrains Mono";

const LOCATE_ATTEMPTS = 18; // one per 5 s tick, so about 90 s

export class Dispatch {
  constructor(app) {
    this.app = app;
    this.reset();
  }

  reset() {
    this.step = "workflows"; // workflows | refs | inputs | confirm | notice
    this.workflows = []; this.loaded = false; this.loading = false; this.error = null;
    this.workflow = null; this.refs = []; this.ref = ""; this.inputs = []; this.warnings = [];
    this.problem = ""; this.busy = ""; this.notice = ""; this.locate = null; this.autoDone = false; this.login = "";
    this.stepsWidth = 340;
    this.filter = this.makeFilter("Filter workflows");
    this.refFilter = this.makeFilter("Filter branches");
  }

  makeFilter(placeholder) {
    const state = InputState.new({ placeholder });
    state.on("change", (_e, cx) => cx.notify());
    return state;
  }

  // ---- loading -----------------------------------------------------------

  /** Reads every workflow once and keeps those that declare workflow_dispatch. */
  load(cx) {
    const gh = this.app.gh;
    if (!gh || this.loading || this.loaded) return;
    this.loading = true; this.error = null;
    cx.spawn(async (cx) => {
      try {
        const def = this.app.repo.defaultBranch;
        const [list, login] = await Promise.all([gh.listWorkflows(), gh.getLogin().catch(() => "")]);
        const candidates = list.filter((w) => w.path?.startsWith(".github/workflows/") && w.state !== "deleted");
        if (!candidates.length) throw new Error("No GitHub Actions workflows were found.");

        const probes = await mapLimit(candidates, 6, async (workflow) => {
          if (workflow.state !== "active") return { workflow, ok: false };
          try {
            const yaml = await gh.rawFile(workflow.path, def);
            const parsed = parseWorkflowInputs(yaml);
            return { workflow: { ...workflow, yaml, inputCount: parsed.inputs.length }, ok: parsed.dispatchable, name: parsed.name };
          } catch (error) { return { workflow, ok: false, error }; }
        });
        if (this.app.gh !== gh) return;

        const found = probes.filter((p) => p.ok).map((p) => p.workflow).sort((a, b) => a.name.localeCompare(b.name));
        if (!found.length) {
          const errors = probes.filter((p) => p.error);
          if (errors.length === probes.length) throw errors[0].error;
          throw new Error(`No active workflow declares workflow_dispatch on ${def || "the default branch"}. Add "on: workflow_dispatch" to a workflow file to run it here.`);
        }
        this.workflows = found; this.login = login; this.loaded = true;
        this.autoStart(cx);
      } catch (e) {
        if (this.app.gh === gh) this.error = e;
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  /** `props: {workflow, ref}` pre-selects a workflow and branch, up to the inputs form. */
  autoStart(cx) {
    const want = String(this.app.props.workflow || "").toLowerCase();
    if (!want || this.autoDone) return;
    this.autoDone = true;
    const w = this.workflows.find((x) => `${x.name} ${x.path}`.toLowerCase().includes(want));
    if (w) this.chooseWorkflow(w, cx);
  }

  chooseWorkflow(workflow, cx) {
    const gh = this.app.gh;
    this.workflow = workflow; this.problem = ""; this.refs = [];
    this.refFilter.set_value("");
    this.step = "refs"; this.busy = `Loading branches for ${workflow.name}…`;
    cx.spawn(async (cx) => {
      try {
        const branches = await gh.listBranches();
        if (this.app.gh !== gh || this.workflow !== workflow) return;
        if (!branches.length) throw new Error("No branches were found.");
        const def = this.app.repo.defaultBranch, cur = this.app.branch;
        const rank = (b) => (b.name === def ? 0 : b.name === cur ? 1 : 2);
        this.refs = branches.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
        this.busy = "";
        const wantRef = this.app.props.ref;
        if (wantRef && this.app.props.workflow && this.refs.some((b) => b.name === wantRef)) this.chooseRef(wantRef, cx);
      } catch (e) {
        if (this.workflow === workflow) { this.busy = ""; this.step = "notice"; this.notice = `Could not load branches: ${e.message || e}`; }
      }
      cx.notify();
    });
    cx.notify();
  }

  chooseRef(name, cx) {
    const gh = this.app.gh, workflow = this.workflow;
    this.ref = name; this.problem = "";
    this.busy = `Reading ${workflow.path} at ${name}…`;
    cx.spawn(async (cx) => {
      try {
        const yaml = name === this.app.repo.defaultBranch && workflow.yaml ? workflow.yaml : await gh.rawFile(workflow.path, name);
        const parsed = parseWorkflowInputs(yaml);
        if (this.app.gh !== gh || this.workflow !== workflow) return;
        if (!parsed.dispatchable) throw new Error(`${workflow.path} does not declare workflow_dispatch on ${name}.`);
        this.inputs = parsed.inputs.map((input) => this.makeField(input));
        this.warnings = parsed.warnings;
        this.busy = "";
        // With no inputs there is nothing to fill, so go straight to Review.
        this.step = this.inputs.length ? "inputs" : "confirm";
      } catch (e) {
        if (this.workflow === workflow) { this.busy = ""; this.step = "refs"; this.problem = String(e.message || e); }
      }
      cx.notify();
    });
    cx.notify();
  }

  makeField(input) {
    const field = { ...input, value: input.default, state: null };
    if (input.type === "string" || input.type === "number" || input.type === "environment") {
      field.state = InputState.new({ placeholder: input.type === "number" ? "number" : input.name });
      field.state.set_value(input.default);
      field.state.on("change", (_e, cx) => { field.value = field.state.value(); cx.notify(); });
    }
    return field;
  }

  // ---- validation and dispatch -------------------------------------------

  validate() {
    if (this.inputs.length > 25) return "GitHub accepts at most 25 inputs per dispatch.";
    for (const f of this.inputs) {
      const value = String(f.state ? f.state.value() : f.value ?? "");
      if (f.required && value.trim() === "") return `${f.name} is required.`;
      if (f.type === "number" && value.trim() !== "" && !Number.isFinite(Number(value))) return `${f.name} must be a number.`;
      if (f.type === "choice" && f.options.length && !f.options.includes(value)) return `${f.name} must be one of: ${f.options.join(", ")}.`;
    }
    return "";
  }

  payload() {
    const out = {};
    for (const f of this.inputs) {
      const value = String(f.state ? f.state.value() : f.value ?? "");
      out[f.name] = f.type === "boolean" ? (value === "true" ? "true" : "false") : value;
    }
    return out;
  }

  review(cx) {
    this.problem = this.validate();
    if (!this.problem) this.step = "confirm";
    cx.notify();
  }

  dispatch(cx) {
    const gh = this.app.gh, workflow = this.workflow, ref = this.ref;
    this.problem = this.validate();
    if (this.problem) { this.step = "inputs"; cx.notify(); return; }
    const inputs = this.payload();
    this.busy = "Dispatching workflow…";
    cx.spawn(async (cx) => {
      let baseline = 0;
      try {
        const runs = await gh.listDispatchRuns(workflow.id, { ref, actor: this.login });
        baseline = runs.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0);
      } catch {}
      const startedAt = Date.now();
      try {
        const result = await gh.dispatch(workflow.id, ref, inputs);
        if (result.runId) this.finish(result.runId, cx);
        else {
          this.locate = { baseline, startedAt, attempts: 0, workflowId: workflow.id, ref, inFlight: false };
          this.busy = "Workflow dispatched. Looking for the new run…";
          this.tryLocate(cx);
        }
      } catch (e) {
        this.busy = ""; this.step = "confirm"; this.problem = String(e.message || e);
      }
      cx.notify();
    });
    cx.notify();
  }

  /** Called from the panel's 5 s tick until the new run shows up. */
  tryLocate(cx) {
    const loc = this.locate, gh = this.app.gh;
    if (!loc || loc.inFlight || !gh) return;
    loc.inFlight = true; loc.attempts += 1;
    this.busy = `Workflow dispatched. Looking for the new run (${loc.attempts}/${LOCATE_ATTEMPTS})…`;
    cx.spawn(async (cx) => {
      try {
        const runs = await gh.listDispatchRuns(loc.workflowId, { ref: loc.ref, actor: this.login });
        const match = runs.find((r) => Number(r.id) > loc.baseline && Date.parse(r.created_at || "") >= loc.startedAt - 60000);
        if (match) { this.locate = null; this.finish(match.id, cx); }
        else if (loc.attempts >= LOCATE_ATTEMPTS) this.giveUp("The workflow was dispatched, but its run could not be located. Look for it in the Runs tab. It was not dispatched a second time.");
      } catch (e) {
        if (e instanceof GhError && [401, 403, 404].includes(e.status)) this.giveUp(`The workflow was dispatched, but its run could not be read: ${e.message}`);
      } finally {
        loc.inFlight = false;
        cx.notify();
      }
    });
  }

  giveUp(message) {
    this.locate = null; this.busy = ""; this.step = "notice"; this.notice = message;
  }

  finish(runId, cx) {
    this.locate = null; this.busy = "";
    this.step = "workflows"; this.workflow = null; this.inputs = [];
    this.app.tab = "runs";
    this.app.loadRuns(cx, true);
    this.app.openRun(runId, cx);
  }

  back(cx) {
    this.problem = "";
    if (this.step === "refs") this.step = "workflows";
    else if (this.step === "inputs") this.step = "refs";
    else if (this.step === "confirm") this.step = this.inputs.length ? "inputs" : "refs";
    else if (this.step === "notice") this.step = this.workflow ? "refs" : "workflows";
    cx.notify();
  }

  // ---- UI ----------------------------------------------------------------

  stepIndex() {
    return { workflows: 1, refs: 2, inputs: 3, confirm: 4 }[this.step] ?? 0;
  }

  /** Going back to a finished step keeps what was loaded. */
  goStep(n, cx) {
    const target = { 1: "workflows", 2: "refs", 3: "inputs" }[n];
    if (!target || n >= this.stepIndex() || (target === "inputs" && !this.inputs.length)) return;
    this.step = target; this.problem = "";
    cx.notify();
  }

  box(id, state, t) {
    return div().id(id).h(30).flex_none().px(10).flex().items_center().rounded(8).bg(t.background).border_1().border_color(t.border).cursor_text()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(Input.new(state).h_full().w_full().text_size(12).text_color(t.foreground));
  }

  /** A choice chip; the picked one is tinted with the accent color. */
  chip(id, label, active, onClick, t) {
    return div().id(id).h(26).px(10).flex_none().flex().items_center().rounded(7).text_size(12).border_1()
      .border_color(active ? t.accent : t.border).bg(active ? tint(t.accent, "33") : t.background)
      .text_color(active ? t.accent : t.muted).cursor_pointer().hover((s) => s.bg(active ? tint(t.accent, "33") : t.hover))
      .on_click((_e, cx) => onClick(cx)).child(label);
  }

  button(id, label, onClick, t) { return this.app.button(id, label, onClick, t); }

  /** The strong call to action: `▶ Dispatch`, `Review →`. */
  primary(id, label, onClick, t, symbol) {
    return h_flex().id(id).h(32).px(16).gap(6).flex_none().items_center().rounded(8).bg(t.solid).text_color(t.solid_foreground)
      .text_size(13).font_semibold().cursor_pointer().hover((s) => s.bg(t.accent)).on_click((_e, cx) => onClick(cx))
      .when(Boolean(symbol), (e) => e.child(svg(icon(symbol)).size(13).flex_none()))
      .child(label);
  }

  footer(t, left, right) {
    return h_flex().flex_none().px(14).py(10).gap(8).items_center().justify_between().border_t(1).border_color(t.border)
      .child(left ?? div()).child(right ?? div());
  }

  banner(t, text, color, symbol = "info") {
    return h_flex().flex_none().px(12).py(8).gap(8).items_center().rounded(10).bg(tint(color, "1c")).border_1().border_color(tint(color, "44"))
      .child(svg(icon(symbol)).size(14).flex_none().text_color(color))
      .child(div().flex_1().min_w(0).text_size(12).text_color(color).child(text));
  }

  /** The workflow the next steps are about, and the branch once it is chosen. */
  summary(t, withRef) {
    const w = this.workflow;
    return h_flex().flex_none().px(14).py(8).gap(10).items_center().border_t(1).border_b(1).border_color(t.border)
      .child(iconTile(t, "play", t.accent))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().truncate().text_size(14).font_semibold().child(w.name))
        .child(div().truncate().text_size(11).text_color(t.dim).font_family(mono()).child(w.path)))
      .when(withRef && Boolean(this.ref), (e) => e.child(pill(t, { label: this.ref, symbol: "branch", code: true })));
  }

  view(t) {
    const app = this.app, cur = this.stepIndex();
    let body;
    if (this.busy) body = busy(t, this.busy);
    else if (this.step === "refs") body = this.refsView(t);
    else if (this.step === "inputs") body = this.inputsView(t);
    else if (this.step === "confirm") body = this.confirmView(t);
    else if (this.step === "notice") body = this.noticeView(t);
    else body = this.workflowsView(t);
    const showSteps = cur > 0 && (this.loaded || this.workflow);
    return v_flex().flex_1().min_h(0)
      .when(showSteps, (e) => e.child(stepper(t, "dsp-steps", ["Workflow", "Branch", "Inputs", "Review"], cur, this.stepsWidth >= 420, (n, cx) => this.goStep(n, cx))
        .on_size_change((size, cx) => { if (Math.abs((this.stepsWidth || 0) - size.width) > 1) { this.stepsWidth = size.width; cx.notify(); } })))
      .child(body);
  }

  noticeView(t) {
    return v_flex().flex_1().min_h(0).p(16).gap(12)
      .child(this.banner(t, this.notice, t.blocked, "info"))
      .child(h_flex().child(this.button("dsp-notice-back", "‹ Back", (cx) => { this.step = this.workflow ? "refs" : "workflows"; cx.notify(); }, t)));
  }

  workflowsView(t) {
    const app = this.app;
    if (this.error) {
      return v_flex().flex_1().min_h(0).child(app.errorView(t, this.error))
        .child(this.footer(t, null, app.button("dsp-retry", "Retry", (cx) => { this.error = null; this.loaded = false; this.load(cx); }, t, { primary: true })));
    }
    if (!this.loaded) return busy(t, "Reading workflows…", "Checking which ones can be started manually.");
    const query = this.filter.value().trim().toLowerCase();
    const list = query ? this.workflows.filter((w) => `${w.name} ${w.path}`.toLowerCase().includes(query)) : this.workflows;
    const now = Date.now();
    return v_flex().flex_1().min_h(0)
      .child(v_flex().flex_none().px(12).pt(4).pb(6).gap(8)
        .child(div().px(2).text_size(12).text_color(t.dim).child("Pick a workflow to run by hand."))
        .child(searchBox(t, "dsp-filter", this.filter, { right: query ? `${list.length}/${this.workflows.length}` : `${this.workflows.length}`, onClear: (cx) => { this.filter.set_value(""); cx.notify(); } })))
      .child(v_flex().id("dsp-wf-scroll").flex_1().min_h(0).overflow_y_scrollbar().px(12).pt(2).pb(12).gap(8)
        .children(list.map((w) => {
          const last = app.runs.find((r) => r.workflow_id === w.id);
          return v_flex().id(`wf-${w.id}`).w_full().flex_none().p(12).gap(8).rounded(10).bg(t.raised).border_1().border_color(t.border)
            .cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.chooseWorkflow(w, cx))
            .child(h_flex().gap(10).items_center()
              .child(iconTile(t, "play", t.accent))
              .child(v_flex().flex_1().min_w(0).gap(1)
                .child(div().truncate().text_size(14).child(w.name))
                .child(div().truncate().text_size(11).text_color(t.dim).font_family(mono()).child(w.path)))
              .child(div().flex_none().text_size(16).text_color(t.dim).child("›")))
            .child(h_flex().pl(38).flex_wrap().gap(6).items_center()
              .child(pill(t, { label: w.inputCount ? `${w.inputCount} input${w.inputCount === 1 ? "" : "s"}` : "no inputs", color: w.inputCount ? t.accent : undefined }))
              .when(Boolean(last), (e) => e.child(app.statePill(stateOf(last), t)).child(div().text_size(11).text_color(t.dim).child(`last run ${relTime(last.created_at, now)}`)))
              .when(!last, (e) => e.child(div().text_size(11).text_color(t.dim).child("no recent run"))));
        }))
        .when(!list.length, (e) => e.child(div().p(16).text_size(12).text_color(t.dim).child("No workflow matches."))));
  }

  refsView(t) {
    const def = this.app.repo.defaultBranch, cur = this.app.branch;
    const query = this.refFilter.value().trim().toLowerCase();
    const list = query ? this.refs.filter((b) => b.name.toLowerCase().includes(query)) : this.refs;
    return v_flex().flex_1().min_h(0)
      .child(this.summary(t, false))
      .child(v_flex().flex_none().px(12).pt(10).pb(2).gap(6)
        .child(searchBox(t, "dsp-ref-filter", this.refFilter, { right: query ? `${list.length}/${this.refs.length}` : `${this.refs.length}`, onClear: (cx) => { this.refFilter.set_value(""); cx.notify(); } }))
        .when(Boolean(this.problem), (e) => e.child(this.banner(t, this.problem, t.ansi1, "info"))))
      .child(v_flex().id("dsp-ref-scroll").flex_1().min_h(0).overflow_y_scrollbar().pb(8)
        .child(section(t, "BRANCHES", list.length, t.muted, "Choose where the run starts"))
        .children(list.map((b) => h_flex().id(`ref-${b.name}`).w_full().flex_none().h(38).px(14).gap(10).items_center().cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.chooseRef(b.name, cx))
          .child(svg(icon("branch")).size(14).flex_none().text_color(b.name === def ? t.accent : t.dim))
          .child(div().flex_1().min_w(0).truncate().font_family(mono()).text_size(12).child(b.name))
          .when(b.name === def, (e) => e.child(pill(t, { label: "default", color: t.accent })))
          .when(b.name === cur && b.name !== def, (e) => e.child(pill(t, { label: "current" })))
          .child(div().flex_none().text_size(16).text_color(t.dim).child("›"))))
        .when(!list.length, (e) => e.child(div().p(16).text_size(12).text_color(t.dim).child("No branch matches."))))
      .child(this.footer(t, this.button("dsp-back", "‹ Workflows", (cx) => this.goStep(1, cx), t)));
  }

  fieldCard(f, t) {
    const setValue = (v, cx) => { f.value = v; cx.notify(); };
    let editor;
    if (f.state) editor = this.box(`in-${f.name}`, f.state, t);
    else if (f.type === "boolean") editor = segmented(t, `in-${f.name}`, ["true", "false"], f.value, setValue);
    else editor = h_flex().flex_wrap().gap(6).children(f.options.map((o) => this.chip(`in-${f.name}-${o}`, o, f.value === o, (cx) => setValue(o, cx), t)));
    return v_flex().flex_none().p(12).gap(8).rounded(10).bg(t.raised).border_1().border_color(t.border)
      .child(h_flex().gap(8).items_center()
        .child(div().min_w(0).truncate().font_semibold().text_size(13).child(f.name))
        .child(f.required ? pill(t, { label: "required", color: t.ansi1 }) : pill(t, { label: "optional" }))
        .child(div().flex_1())
        .child(pill(t, { label: f.type, code: true })))
      .when(Boolean(f.description), (e) => e.child(div().text_size(11).text_color(t.dim).child(f.description)))
      .child(editor);
  }

  inputsView(t) {
    return v_flex().flex_1().min_h(0)
      .child(this.summary(t, true))
      .child(v_flex().id("dsp-in-scroll").flex_1().min_h(0).overflow_y_scrollbar().px(12).py(12).gap(10)
        .children(this.warnings.map((w) => this.banner(t, w, t.blocked, "info")))
        .children(this.inputs.map((f) => this.fieldCard(f, t))))
      .when(Boolean(this.problem), (e) => e.child(v_flex().flex_none().px(12).pb(8).child(this.banner(t, this.problem, t.ansi1, "info"))))
      .child(this.footer(t, this.button("dsp-back", "‹ Branches", (cx) => this.goStep(2, cx), t), this.primary("dsp-review", "Review →", (cx) => this.review(cx), t)));
  }

  confirmView(t) {
    const rows = this.inputs.map((f) => [f.name, String(f.state ? f.state.value() : f.value ?? "")]);
    return v_flex().flex_1().min_h(0)
      .child(this.summary(t, true))
      .child(v_flex().id("dsp-confirm-scroll").flex_1().min_h(0).overflow_y_scrollbar().px(12).py(12).gap(10)
        .child(this.banner(t, "Nothing starts until you press Dispatch.", t.accent, "info"))
        .when(rows.length > 0, (e) => e.child(section(t, "INPUTS", rows.length, t.muted)))
        .when(rows.length > 0, (e) => e.child(v_flex().flex_none().rounded(10).bg(t.raised).border_1().border_color(t.border).overflow_hidden()
          .children(rows.map(([k, v], i) => h_flex().w_full().px(12).py(8).gap(12).items_start()
            .when(i > 0, (x) => x.border_t(1).border_color(t.border))
            .child(div().w(110).flex_none().truncate().text_size(11).text_color(t.dim).font_family(mono()).child(k))
            .child(div().flex_1().min_w(0).text_size(12).font_family(mono()).text_color(v === "" ? t.dim : t.foreground).child(v === "" ? "(empty)" : v))))))
        .when(rows.length === 0, (e) => e.child(h_flex().flex_none().px(12).py(10).gap(10).items_center().rounded(10).bg(t.raised).border_1().border_color(t.border)
          .child(iconTile(t, "play", t.muted, 24))
          .child(v_flex().flex_1().min_w(0).gap(1)
            .child(div().text_size(13).child("No inputs to fill"))
            .child(div().text_size(11).text_color(t.dim).child(`The run starts on ${this.ref} with the workflow's own defaults.`)))))
        .when(Boolean(this.problem), (e) => e.child(this.banner(t, this.problem, t.ansi1, "info"))))
      .child(this.footer(t, this.button("dsp-back", "‹ Back", (cx) => { this.step = this.inputs.length ? "inputs" : "refs"; this.problem = ""; cx.notify(); }, t),
        this.primary("dsp-go", "Dispatch", (cx) => this.dispatch(cx), t, "play")));
  }
}
