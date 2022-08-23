class Debug
{
	constructor()
	{
		this._create();
	}
	
	show(string, log=[], lineCount=20)
	{
		const end = log.length;
		const start = Math.max(0, end - lineCount);
		const bufferArray = [];
		for (let i = start; i < end; i++)
		{
			bufferArray.push(log[i]);
		}

		const debug = document.querySelector('#debug pre');
		debug.textContent = `${string}\n${bufferArray.join("\n")}`;
	}
	
	_create()
	{
		const debug = document.createElement("div");
		debug.innerHTML = `
		<div id="debug">
			<pre></pre>
		</div>
		<style>
			#debug {
				position: absolute;
				left: 1em;
				top: 1em;
				padding: 1em;
				background: rgba(0, 0, 0, 0.8);
				color: white;
				font-family: monospace;
			}
		</style>
		`;
		document.body.append(debug);
	}
}

const debug = new Debug();
export default debug;