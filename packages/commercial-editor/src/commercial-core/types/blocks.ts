export type CommercialBlockType =
  | "headline"
  | "subheading"
  | "text"
  | "line_item";

export type LineItemSubtype = "position" | "headline" | "text" | "page_break";

export interface CommercialHeadlineContent {
  billing_type?: string | null;
  content?: string | null;
  is_phase?: boolean;
  timeframe_from?: string | null;
  timeframe_until?: string | null;
  title: string;
  [key: string]: unknown;
}

export interface CommercialSubheadingContent {
  title: string;
  [key: string]: unknown;
}

export interface CommercialTextContent {
  content: string;
  [key: string]: unknown;
}

export interface CommercialLineItemContent {
  amount: number;
  content: string;
  cost_per_item: number;
  item_total?: number;
  line_item_subtype?: LineItemSubtype;
  parent_id?: string | null;
  position?: string | null;
  tax: number;
  title: string;
  unit: string;
  [key: string]: unknown;
}

export type CommercialBlockContent =
  | CommercialHeadlineContent
  | CommercialSubheadingContent
  | CommercialTextContent
  | CommercialLineItemContent;

export interface CommercialBlock {
  content: CommercialBlockContent | Record<string, unknown>;
  id: string;
  order_index: number;
  type: string;
}
