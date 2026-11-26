export const SIDE_HANDLE_IDS = ['top', 'right', 'bottom', 'left'] as const
export type SideHandleId = (typeof SIDE_HANDLE_IDS)[number]
