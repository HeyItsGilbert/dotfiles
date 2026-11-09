// Reads `on.workflow_dispatch.inputs` from a workflow file. Port of the TUI
// plugin's parser; `yaml.js` is a browser bundle of the `yaml` package.
import { parse } from "./yaml.js";

const INPUT_TYPES = new Set(["string", "choice", "boolean", "number", "environment"]);

export class WorkflowInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkflowInputError";
  }
}

function hasDispatch(on) {
  if (typeof on === "string") return on === "workflow_dispatch";
  if (Array.isArray(on)) return on.includes("workflow_dispatch");
  if (on && typeof on === "object") return Object.prototype.hasOwnProperty.call(on, "workflow_dispatch");
  return false;
}

function dispatchBlock(on) {
  if (on && typeof on === "object" && !Array.isArray(on)) {
    const block = on.workflow_dispatch;
    return block && typeof block === "object" ? block : null;
  }
  return null;
}

function normalizeInput(name, raw, warnings) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push(`Input "${name}" is not a mapping; treating it as an empty string input.`);
    raw = {};
  }

  let type = typeof raw.type === "string" ? raw.type : "string";
  if (!INPUT_TYPES.has(type)) {
    warnings.push(`Input "${name}" has unknown type "${type}"; treating it as a string.`);
    type = "string";
  }

  let options = [];
  if (type === "choice") {
    options = Array.isArray(raw.options) ? raw.options.map((option) => String(option)) : [];
    if (options.length === 0) warnings.push(`Input "${name}" is a choice without options.`);
  }

  let value;
  if (raw.default === undefined || raw.default === null) value = type === "boolean" ? "false" : type === "number" ? "0" : "";
  else value = String(raw.default);

  if (type === "boolean" && value !== "true" && value !== "false") value = value.toLowerCase() === "true" ? "true" : "false";

  if (type === "choice" && options.length > 0 && !options.includes(value)) {
    warnings.push(`Input "${name}" has default "${value}", which is not one of its options; using "${options[0]}".`);
    value = options[0];
  }

  return {
    name,
    type,
    description: typeof raw.description === "string" ? raw.description : "",
    required: raw.required === true,
    default: value,
    options,
  };
}

export function parseWorkflowInputs(source) {
  let document;
  try {
    document = parse(String(source));
  } catch (error) {
    throw new WorkflowInputError(`Could not parse workflow YAML: ${error.message}`);
  }

  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new WorkflowInputError("The workflow file is not a YAML mapping.");
  }

  const name = typeof document.name === "string" ? document.name : "";
  if (!hasDispatch(document.on)) return { dispatchable: false, name, inputs: [], warnings: [] };

  const block = dispatchBlock(document.on);
  const rawInputs = block?.inputs && typeof block.inputs === "object" ? block.inputs : {};
  const warnings = [];
  const inputs = Object.entries(rawInputs).map(([key, raw]) => normalizeInput(key, raw, warnings));
  if (inputs.length > 25) warnings.push(`This workflow declares ${inputs.length} inputs. GitHub accepts at most 25 per dispatch.`);
  return { dispatchable: true, name, inputs, warnings };
}
