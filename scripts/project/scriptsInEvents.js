


const scriptsInEvents = {

		async EventSheet1_Event6(runtime, localVars)
		{
			globalThis.dispatchEvent(new CustomEvent("restart"));
		},

		async EventSheet1_Event10(runtime, localVars)
		{
			globalThis.dispatchEvent(new CustomEvent("get score"));
		},

		async EventSheet1_Event12(runtime, localVars)
		{
			globalThis.dispatchEvent(new CustomEvent("products"));
		},

		async Polyfill_Event7(runtime, localVars)
		{
			globalThis.dispatchEvent(new CustomEvent("image loading complete"));
		},

		async Polyfill_Event18(runtime, localVars)
		{
			globalThis.dispatchEvent(new CustomEvent("tap gesture", {detail: {x: localVars.x_, y: localVars.y_}}));
		}

};

self.C3.ScriptsInEvents = scriptsInEvents;

