(async () => { const { ContextManager } = await import("/core/ui/context-manager/context-manager.js"); const closed = [];
for (let k = 0; k < 6 && !ContextManager.isEmpty; k++) { const t = ContextManager.getCurrentTarget(); closed.push(String(t && t.tagName)); ContextManager.pop(t); await new Promise(r => setTimeout(r, 400)); }
try { const CM = (await import("/base-standard/ui/cinematic/cinematic-manager.js")).default; const { InterfaceMode } = await import("/core/ui/interface-modes/interface-modes.js"); if (InterfaceMode.getCurrent() === "INTERFACEMODE_CINEMATIC") { CM.stop(); closed.push("cinematic"); } } catch (e) {}
return JSON.stringify({ closed, empty: ContextManager.isEmpty }); })()
