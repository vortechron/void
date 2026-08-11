import { describe, expect, it, vi } from "vite-plus/test";

import { registerServiceWorker } from "./registerServiceWorker";

describe("registerServiceWorker", () => {
  it("registers the app-shell worker at the root scope", async () => {
    const registration = {} as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(registration);

    const result = await registerServiceWorker({ container: { register } });

    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    expect(result).toBe(registration);
  });

  it("uses an explicit script url when one is given", async () => {
    const register = vi.fn().mockResolvedValue({} as ServiceWorkerRegistration);

    await registerServiceWorker({ container: { register }, scriptUrl: "/custom-sw.js" });

    expect(register).toHaveBeenCalledWith("/custom-sw.js", { scope: "/" });
  });

  it("returns null when the browser has no service worker container", async () => {
    await expect(registerServiceWorker({ container: undefined })).resolves.toBeNull();
  });

  it("reports registration failures without throwing", async () => {
    const error = new Error("insecure context");
    const register = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();

    const result = await registerServiceWorker({ container: { register }, onError });

    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith(error);
  });
});
