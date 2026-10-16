/**
 * UI primitives.
 *
 * One barrel, one design language. The legacy shims that used to live here
 * (Card, StatCard, StatusBadge, Table, Td, LinkButton, …) have been removed:
 * every screen now renders through the components in this directory, so a new
 * page cannot drift back to the old palette or the old box shapes.
 */
export { Button, ButtonLink, IconButton, Segmented } from "./button";
export { Input, Textarea, Select, Checkbox, Field, DefinitionList } from "./input";
export { Panel, PageHeader, PanelGrid } from "./panel";
export { StatusDot, StatusChip, Tag } from "./badge";
export { TableWrap, THead, TH, TBody, TR, TD, TDPrimary, RowActions } from "./table";
export {
  StatTile,
  MetricStrip,
  MetricCell,
  MiniStat,
  Notice,
  ProgressBar,
} from "./stat";
export { EmptyState, ErrorState, Skeleton, SkeletonRows } from "./empty";
export { Sheet, Modal } from "./sheet";
export { toneFor, type Tone } from "@/lib/status";
