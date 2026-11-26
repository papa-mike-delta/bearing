/**
 * Centralized toast notification utility for bearing.now.
 *
 * Wraps `sonner` with semantic helpers so every user action
 * gets consistent, accessible feedback.
 */

import { toast } from "sonner";

const DEFAULT_DURATION = 4000;

export const notify = {
  success: (message: string, description?: string) =>
    toast.success(message, {
      description,
      duration: DEFAULT_DURATION,
    }),

  error: (message: string, description?: string) =>
    toast.error(message, {
      description,
      duration: DEFAULT_DURATION + 2000,
    }),

  warning: (message: string, description?: string) =>
    toast.warning(message, {
      description,
      duration: DEFAULT_DURATION,
    }),

  info: (message: string, description?: string) =>
    toast.info(message, {
      description,
      duration: DEFAULT_DURATION,
    }),

  promise: <T>(
    promise: Promise<T>,
    opts: { loading: string; success: string; error: string },
  ) =>
    toast.promise(promise, {
      loading: opts.loading,
      success: opts.success,
      error: opts.error,
    }),

  dismiss: (id?: string | number) => toast.dismiss(id),
};

export { toast };
