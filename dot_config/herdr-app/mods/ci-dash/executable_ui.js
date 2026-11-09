// Shared visual pieces of the CI Dash mod: pills, section headers, the search
// box and the filter chips.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, Input } from "gpui-base";
import { settings } from "herdr";

export const MOD = "ci-dash"; // folder name under ~/.config/herdr-app/mods
export const icon = (name) => `mods/${MOD}/${name}.svg`;

/** A translucent version of a theme color, for tinted pills. Non-hex colors pass through. */
export const tint = (color, alpha = "24") => (/^#[0-9a-f]{6}$/i.test(color || "") ? color + alpha : color);

const mono = () => settings().font_family ?? "JetBrains Mono";

/**
 * A small rounded label. `color` tints the background and colors the text;
 * without it the pill is neutral. `glyph` is a text mark, `symbol` an svg name.
 */
export function pill(t, { label, color, glyph, symbol, spin = false, code = false }) {
  const fg = color || t.muted;
  return h_flex().h(20).px(7).gap(4).flex_none().items_center().rounded(6).text_size(11)
    // A neutral pill is a faint wash of the text color, so it shows on both the page and the cards.
    .bg(color ? tint(color) : tint(t.foreground, "1a")).text_color(fg)
    .when(code, (e) => e.font_family(mono()))
    .when(Boolean(glyph), (e) => e.child(div().flex_none().child(glyph)))
    .when(Boolean(symbol) && !spin, (e) => e.child(svg(icon(symbol)).size(11).flex_none()))
    .when(spin, (e) => e.child(svg(icon("spinner")).size(11).flex_none().spin(900)))
    .child(div().truncate().child(label));
}

/** `NEEDS ATTENTION  2  ─────────`. `meta` is a dim note that shrinks first. */
export function section(t, label, count, color, meta = "") {
  return h_flex().flex_none().w_full().px(14).pt(14).pb(4).gap(8).items_center()
    .child(div().flex_none().text_size(11).font_semibold().text_color(color || t.muted).child(label))
    .child(div().flex_none().text_size(11).text_color(t.dim).child(String(count)))
    .when(Boolean(meta), (e) => e.child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(meta)))
    .child(div().flex_1().min_w(8).h(1).bg(t.border));
}

/** A filter box with a magnifier, the typed text, and `right` (a count) at the end. */
export function searchBox(t, id, state, { right = "", onClear } = {}) {
  const typed = state.value().length > 0;
  return h_flex().id(id).h(36).flex_none().px(12).gap(8).items_center().rounded(10).bg(t.raised)
    .border_1().border_color(t.border).cursor_text()
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(svg(icon("search")).size(14).flex_none().text_color(t.dim))
    .child(Input.new(state).h_full().flex_1().min_w(0).text_size(12).text_color(t.foreground))
    .when(Boolean(right), (e) => e.child(div().flex_none().text_size(11).text_color(t.dim).child(right)))
    .when(typed && Boolean(onClear), (e) => e.child(div().id(`${id}-clear`).size(18).flex_none().flex().items_center().justify_center()
      .rounded(5).cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => onClear(cx))
      .child(svg(icon("close")).size(11).text_color(t.muted))));
}

/** A centered spinner with a title and an optional hint, for loading states. */
export function busy(t, title, detail = "") {
  return v_flex().flex_1().min_h(0).items_center().justify_center().gap(10).p(24)
    .child(svg(icon("spinner")).size(22).flex_none().text_color(t.accent).spin(900))
    .child(div().text_size(13).text_color(t.foreground).child(title))
    .when(Boolean(detail), (e) => e.child(div().text_size(11).text_color(t.dim).child(detail)));
}

/** A rounded square holding an icon, tinted with `color`. */
export function iconTile(t, name, color, size = 28) {
  return div().size(size).flex_none().flex().items_center().justify_center().rounded(8).bg(tint(color, "26"))
    .child(svg(icon(name)).size(Math.round(size / 2)).text_color(color));
}

/** Connected one-choice buttons, such as `true | false`. */
export function segmented(t, id, options, value, onPick) {
  return h_flex().id(id).flex_none().self_start().h(28).rounded(8).overflow_hidden().border_1().border_color(t.border)
    .children(options.map((option, i) => {
      const on = option === value;
      return div().id(`${id}-${option}`).h_full().px(16).flex().items_center().text_size(12).cursor_pointer()
        .when(i > 0, (e) => e.border_l(1).border_color(t.border))
        .bg(on ? tint(t.accent, "33") : t.background).text_color(on ? t.accent : t.muted).when(on, (e) => e.font_semibold())
        .hover((s) => s.bg(on ? tint(t.accent, "33") : t.hover))
        .on_click((_e, cx) => onPick(option, cx)).child(option);
    }));
}

/**
 * Numbered steps joined by lines. Done steps are clickable (`onGo(n)`).
 * Labels show for every step when `wide`, else only for the current one.
 */
export function stepper(t, id, steps, current, wide, onGo) {
  const items = [];
  steps.forEach((label, i) => {
    const n = i + 1, done = n < current, active = n === current;
    if (i > 0) items.push(div().flex_1().min_w(6).h(1).bg(n <= current ? tint(t.ansi2, "88") : t.border));
    items.push(h_flex().id(`${id}-${n}`).flex_none().gap(6).items_center().when(done, (e) => e.cursor_pointer().on_click((_e, cx) => onGo(n, cx)))
      .child(div().size(20).rounded(10).flex_none().flex().items_center().justify_center().text_size(11).font_semibold()
        .bg(active ? t.accent : done ? tint(t.ansi2, "33") : t.raised)
        .text_color(active ? t.accent_foreground : done ? t.ansi2 : t.dim)
        .child(done ? "✓" : String(n)))
      .when(wide || active, (e) => e.child(div().text_size(12).text_color(active ? t.foreground : done ? t.muted : t.dim)
        .when(active, (x) => x.font_semibold()).child(label))));
  });
  return h_flex().id(id).flex_none().w_full().px(14).py(10).gap(8).items_center().children(items);
}

/** A selectable filter such as `Failed 2`. */
export function filterChip(t, id, label, count, active, onClick, color) {
  return h_flex().id(id).h(26).px(10).gap(6).flex_none().items_center().rounded(8).text_size(12).cursor_pointer()
    .bg(active ? t.raised : t.background).border_1().border_color(active ? t.border : t.background)
    .text_color(active ? t.foreground : t.muted).hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => onClick(cx))
    .when(Boolean(color), (e) => e.child(div().size(6).rounded(3).flex_none().bg(color)))
    .child(label)
    .child(div().h(16).px(6).rounded(8).flex().items_center().text_size(10).bg(active ? t.hover : t.raised).text_color(t.dim).child(String(count)));
}
