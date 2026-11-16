/**
 * NEMSIS v3.5.1 entry point for the browser bundle. Import lazily (ePCR pages only):
 * the generated schema data is a few hundred KB.
 *
 * Node tests and Cloud Functions load the same JSON with fs and call createNemsisSchema directly.
 */
import structure from "../../data/nemsis/3.5.1/structure.json";
import types from "../../data/nemsis/3.5.1/types.json";
import elements from "../../data/nemsis/3.5.1/elements.json";
import enumerations from "../../data/nemsis/3.5.1/enumerations.json";
import meta from "../../data/nemsis/3.5.1/meta.json";
import { createNemsisSchema } from "./schema.js";

export const NEMSIS_VERSION = "3.5.1";
export const nemsisSchema = createNemsisSchema({ structure, types, elements, enumerations, meta });

export { createNemsisSchema, readLeaf, isEmptyLeaf, NV, PN } from "./schema.js";
export { validateNemsis, summarizeNemsisIssues, checkSimpleValue } from "./validation.js";
export { toNemsisXml, buildEmsDataSetXml, buildDemDataSetXml } from "./xmlExport.js";
