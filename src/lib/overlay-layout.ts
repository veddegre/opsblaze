/**
 * Shared stacking and layout for slide-outs and input-bar pickers.
 * Header stays at z-40; pickers sit below the header bar but above chat.
 */
export const APP_HEADER_BOTTOM = "top-[49px]";

export const pickerBackdropClass = `fixed inset-x-0 bottom-0 ${APP_HEADER_BOTTOM} z-[25]`;
export const pickerPanelClass = "fixed z-[26]";

export const settingsBackdropClass = `fixed inset-x-0 bottom-0 ${APP_HEADER_BOTTOM} z-[40]`;
export const settingsPanelClass = `fixed right-0 bottom-0 ${APP_HEADER_BOTTOM} z-[50]`;

/** Portaled account menu — above settings and pickers. */
export const userMenuPanelClass = "fixed z-[60]";
