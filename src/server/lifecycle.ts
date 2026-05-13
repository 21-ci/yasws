/**
 * Lifecycle hooks for graceful startup/shutdown.
 *
 *   const db = new DbClient()
 *   app.onStart(async () => { await db.connect() })
 *   app.onShutdown(async () => { await db.close() })
 *
 * `YASWSNodeHTTP.listen()` calls `dispatcher.start()` before binding the
 * socket; `close()` calls `dispatcher.shutdown()` after draining requests.
 *
 * In WASI, `dispatcher.start()` is called lazily on the first request (the
 * proxy world has no startup callback). Shutdown hooks do not run in WASI —
 * the component is torn down by the host.
 */

export { LifecycleManager, type LifecycleHook }

type LifecycleHook = () => void | Promise<void>

class LifecycleManager {
    private startHooks: LifecycleHook[] = []
    private shutdownHooks: LifecycleHook[] = []
    private started = false

    public onStart(hook: LifecycleHook): void {
        this.startHooks.push(hook)
    }

    public onShutdown(hook: LifecycleHook): void {
        this.shutdownHooks.push(hook)
    }

    /** Idempotent. Runs registered start hooks once, in order. */
    public async start(): Promise<void> {
        if (this.started) return
        this.started = true
        for (const hook of this.startHooks) await hook()
    }

    /** Runs registered shutdown hooks in reverse order. Always succeeds. */
    public async shutdown(): Promise<void> {
        if (!this.started) return
        this.started = false
        for (const hook of [...this.shutdownHooks].reverse()) {
            try {
                await hook()
            } catch {
                // shutdown hooks must never throw — swallow.
            }
        }
    }
}
