"use client";

import type { ReactComponentImplementation } from "@a2ui/react/v0_9";
import { Catalog } from "@a2ui/web_core/v0_9";
import { AreaChart, BarChart, LineChart } from "./catalog/charts-cartesian.js";
import { DonutChart } from "./catalog/charts-donut.js";
import {
  CheckBox,
  MultipleChoice,
  ObjectPicker,
  Select,
} from "./catalog/choices.js";
import { Form } from "./catalog/form.js";
import {
  DateInput,
  NumberField,
  TextArea,
  TextField,
} from "./catalog/inputs.js";
import {
  Actions,
  Button,
  Card,
  Column,
  Divider,
  Grid,
  Inline,
  List,
} from "./catalog/layout.js";
import { Metric } from "./catalog/metric.js";
import {
  Badge,
  Callout,
  DetailGrid,
  Image,
  Markdown,
  Row,
  Text,
} from "./catalog/records.js";
import { Document, Table } from "./catalog/table.js";
import { ENGENTY_A2UI_CATALOG_ID } from "./spec.js";

/**
 * The engenty A2UI catalog, client side (docs/wip/generative-ui.md §5/§5b):
 * chrome-less components mapped onto ui-core primitives, rendered natively by
 * `@a2ui/react` — theme, query cache, and router for free, no sandbox needed
 * (UI-as-data: the agent can only reference these components).
 *
 * Inputs declare `value` with a Dynamic*Schema, so the binder resolves a
 * `{path}` binding to the current data-model value and hands the component a
 * generated `setValue` that writes back to that path — two-way, with no state
 * of its own. The surface view reads the whole model at submit time.
 */

export type { EngentyA2uiHost } from "./catalog/host.js";
export { EngentyA2uiHostProvider } from "./catalog/host.js";

export function createEngentyA2uiCatalog(): Catalog<ReactComponentImplementation> {
  return new Catalog(ENGENTY_A2UI_CATALOG_ID, [
    List,
    Row,
    DetailGrid,
    Badge,
    Actions,
    Button,
    Text,
    Form,
    TextField,
    TextArea,
    NumberField,
    Select,
    MultipleChoice,
    CheckBox,
    DateInput,
    ObjectPicker,
    Column,
    Inline,
    Card,
    Divider,
    Callout,
    Markdown,
    Image,
    Table,
    Document,
    Grid,
    Metric,
    BarChart,
    LineChart,
    AreaChart,
    DonutChart,
  ]);
}
