export default class BoxWithTick
{
	constructor()
	{
		this.instances = new Map();
		this.b_listener = false;
		
		this.tick = () => {
			for (const instance of this.instances.values()) instance.on_tick();
		};
	}
	
	append(instance, callback)
	{
		const runtime = instance.runtime;
		const instances = this.instances;
		
		instance.on_tick = callback;
		instances.set(instance.uid, instance);
		
		this._add_event_listener(runtime);
		
		instance.addEventListener("destroy", () => {
			instances.delete(instance.uid);
			if (instances.size === 0)
			{
				this._remove_event_listener(runtime);
			}
		});
	}
	
	_add_event_listener(runtime)
	{
		if (this.b_listener) return;
		
		this.b_listener = true;
		runtime.addEventListener("tick", this.tick);
	}
	
	_remove_event_listener(runtime)
	{
		this.b_listener = false;
		runtime.removeEventListener("tick", this.tick);
	}
}