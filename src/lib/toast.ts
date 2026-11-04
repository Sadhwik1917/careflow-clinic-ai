import { sileo, type SileoOptions } from "sileo";

export type ToastInput = string | (Omit<SileoOptions, "type"> & { message?: string });

function normalizeOptions(input: ToastInput, defaultTitle?: string): SileoOptions {
  if (typeof input === "string") {
    const opts: SileoOptions = { title: defaultTitle ?? input };
    if (defaultTitle) {
      opts.description = input;
    }
    return opts;
  }
  const { message, title, description, ...rest } = input;
  const opts: SileoOptions = { ...rest };
  const resolvedTitle = title ?? defaultTitle ?? message;
  if (resolvedTitle !== undefined) {
    opts.title = resolvedTitle;
  }
  const resolvedDesc = description ?? (title && message ? message : undefined);
  if (resolvedDesc !== undefined) {
    opts.description = resolvedDesc;
  }
  return opts;
}

export type ToastPromiseOptions<T> = {
  loading: ToastInput;
  success: ToastInput | ((data: T) => ToastInput);
  error: ToastInput | ((err: unknown) => ToastInput);
  action?: ToastInput | ((data: T) => ToastInput) | undefined;
};

/**
 * Standardized application-wide Sileo toast helper.
 * Provides accessible, theme-consistent notifications across Doctor, Staff,
 * Clinic Owner, Patient, and Admin areas.
 */
export const toast = {
  success: (input: ToastInput) => sileo.success(normalizeOptions(input, "Success")),
  error: (input: ToastInput) => sileo.error(normalizeOptions(input, "Error")),
  warning: (input: ToastInput) => sileo.warning(normalizeOptions(input, "Warning")),
  info: (input: ToastInput) => sileo.info(normalizeOptions(input, "Information")),
  action: (input: ToastInput) => sileo.action(normalizeOptions(input)),
  promise: <T>(
    promiseOrFn: Promise<T> | (() => Promise<T>),
    options: ToastPromiseOptions<T>
  ): Promise<T> => {
    const promise = typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn;
    const promiseOpts: Parameters<typeof sileo.promise<T>>[1] = {
      loading: normalizeOptions(options.loading, "Loading…"),
      success: (data: T) => {
        const out = typeof options.success === "function" ? options.success(data) : options.success;
        return normalizeOptions(out, "Success");
      },
      error: (err: unknown) => {
        const out = typeof options.error === "function" ? options.error(err) : options.error;
        return normalizeOptions(out, "Error");
      },
    };
    if (options.action) {
      const act = options.action;
      promiseOpts.action = (data: T) => {
        const out = typeof act === "function" ? act(data) : act;
        return normalizeOptions(out);
      };
    }
    return sileo.promise(promise, promiseOpts);
  },
  dismiss: (id: string) => sileo.dismiss(id),
  clear: () => sileo.clear(),
};

