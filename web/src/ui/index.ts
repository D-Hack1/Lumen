// Owner: Abhinav
// UI kit barrel. Teammates import from 'src/ui' (tokens, patterns, components). Phase-1 basics:
// Panel, Card, Chip, Badge, InfoBadge, Segmented, Slider, Toast. Later phases add Tooltip, Coachmark, Dial,
// Table, Tabs, Accordion, Modal, ValueWithUncertainty (files exist as placeholders).
export * from './tokens';
export * from './patterns';
export { Panel, type PanelProps } from './Panel';
export { Card, type CardProps } from './Card';
export { Chip, type ChipProps } from './Chip';
export { Badge, type BadgeProps, type BadgeTone } from './Badge';
export { InfoBadge, type InfoBadgeProps } from './InfoBadge';
export { Segmented, type SegmentedOption, type SegmentedProps } from './Segmented';
export { Slider, type SliderProps } from './Slider';
export { ToastViewport, toast, dismissToast, type ToastItem } from './Toast';
