// Load the SDK by creating a script tag and inserting it into the DOM

// Since the loading is asynchronous, LoadScript returns a promise that resolves with "true" when loading completes successfully.

// If there is an error loading, the promise will resolve with "false".

const LoadScript = (scriptUrl) =>
{
	return new Promise((resolve) =>
	{
		const script = document.createElement("script");
		
		script.addEventListener("load", () => resolve(true));
		script.addEventListener("error", () => resolve(false));

		script.src = scriptUrl;

		document.body.appendChild(script);
	});
}

export { LoadScript };