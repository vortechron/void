/** Scope-root worker that backs the installed-app experience (see public/sw.js). */
const SERVICE_WORKER_URL = "/sw.js";

interface RegisterServiceWorkerOptions {
  readonly container: Pick<ServiceWorkerContainer, "register"> | undefined;
  readonly scriptUrl?: string;
  readonly onError?: (error: unknown) => void;
}

/**
 * Registers the app-shell service worker so browsers treat the app as
 * installable. Resolves to null when the browser has no service worker
 * support or registration fails, because neither is fatal to a running tab.
 */
export async function registerServiceWorker(
  options: RegisterServiceWorkerOptions,
): Promise<ServiceWorkerRegistration | null> {
  const { container } = options;
  if (!container) {
    return null;
  }

  try {
    return await container.register(options.scriptUrl ?? SERVICE_WORKER_URL, { scope: "/" });
  } catch (error) {
    options.onError?.(error);
    return null;
  }
}

/** Reads the browser's service worker container, or undefined where it is unavailable. */
export function getServiceWorkerContainer(): ServiceWorkerContainer | undefined {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return undefined;
  }
  return navigator.serviceWorker;
}
