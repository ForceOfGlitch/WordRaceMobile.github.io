/*
runtime.random() [0; 1) Return a random number in the range [0, 1). This is similar to Math.random(), but can produce a deterministic sequence of values if the Advanced Random object overrides the system random.
Math.random() [0; 1)
Math.random(0, 1) - хз. Надо почитать.

Math.PI

Math.abs(x)
Math.exp(x)
Math.log(x) - натуральный логарифм числа
Math.sign(x)
Math.pow(x, y) (или a ** b)
Math.sqrt(x)

in radians:
Math.sin(x)
Math.cos(x)
Math.tan(x)
Math.asin(x)
Math.acos(x)
Math.atan(x)
Math.atan2(y, x)

Math.hypot(x, y)

Math.round(x) Math.round(-1.2)	// -1
Math.floor(x) Math.floor(-1.2)	// -2
Math.ceil(x)  Math.ceil(-1.2)	// -1

Math.min(x, y, ...)
Math.max(x, y, ...)
Math.max() //-Infinity
*/

export const TWO_PI = Math.PI * 2;

export function ctg(x)
{
	return 1 / Math.tan(x);
}

export function arcctg(x)
{
	return (Math.PI / 2) - Math.atan(x);
}

export function lerp(a, b, t)
{
	return a + (t * (b - a));
}

export function unlerp(a, b, y)
{
	/*if (b - a === 0)
	{
		return 0;
	}*/
	
	return a === b ? 0 : (y - a) / (b - a); //unlerp(0, 0, 0) return NaN.
}

export function lerp_dt(a, b, t, dt)
{
	const nt = 1 - Math.pow(t, dt);
	return a + (nt * (b - a));
}

export function clamp(x, a, b)
{
	//return Math.min(Math.max(x, a), b); deprecated.
	
	if (x < a) return a;
	if (x > b) return b;
	return x;
}

export function toRadians(degAngle)
{
	//from degrees to radians
	return degAngle * (Math.PI / 180);
}

export function toDegrees(radAngle) 
{
	//from radians to degrees
	return (radAngle * 180) / Math.PI;
}

export function sin(x)
{
	//in degrees
	return Math.sin(toRadians(x));
}

export function cos(x)
{
	//in degrees
	return Math.cos(toRadians(x));
}

export function angle(x1, y1, x2, y2)
{
	return toDegrees(Math.atan2(y2 - y1, x2 - x1));
}

export function angleRadians(x1, y1, x2, y2)
{
	return Math.atan2(y2 - y1, x2 - x1);
}

export function distance(x1, y1, x2, y2)
{
	return Math.hypot(x2 - x1, y2 - y1);
}

export function sign(x)
{
	if (x == 0)
	{
		return 1;
	}
	
	return x / Math.abs(x);
}

export function getRandInt(min, max) //get_random_integer.
{
	//[min; max]
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function springing(velocity, a, b, dampening_ratio, speed)
{
	//dampening_ratio set between ( 0 - 1 ) || 0 = acts similar to lerp || 1 = will keep bounce back and forth forever
	
	//Apply Dampening
	let result_velocity = velocity * dampening_ratio;
	
	//Set Velocity
	result_velocity += (b - a) * speed;
	
	return result_velocity;
}

export function angleRotate(start, end, step)
{
	// Rotate from angle 'start' towards angle 'end' by the angle 'step' (all in radians). (Повернуть от угла «начало» к углу «конец» на угол «шаг» (все в радианах).)
	const ss = Math.sin(start);
	const cs = Math.cos(start);
	const se = Math.sin(end);
	const ce = Math.cos(end);

	if (Math.acos(ss * se + cs * ce) > step)
	{
		if (cs * se - ss * ce > 0)
			return start + step;
		else
			return start - step;
	}
	else
	{
		return end;
	}
}

export function IsOutsideLayout(inst)
{
	// Test if a given instance is outside the bounds of the layout. (Проверьте, находится ли данный экземпляр за пределами макета.)
	const layout = inst.layout;
	return inst.x < 0 || inst.y < 0 || inst.x > layout.width || inst.y > layout.height;
}

export function px_2_pt(px)
{
	//from pixels to points
	return px * 0.75;
}

export function get_colors(colors)
{
	//принимает object color: [255, 255, 255] и возвращает object color: [1, 1, 1].
	const newColors = {};
	
	for (const c in colors)
	{
		newColors[c] = [colors[c][0] / 255, colors[c][1] / 255, colors[c][2] / 255];
	}
	
	return newColors;
}

// @deprecated (no deprecated)
export async function fetching_file(fileName, runtime, b_json=true)
{
	/*
	на сервере runtime.assets.getProjectFileUrl() === fileName если файл существует или нет. а в констракте если файла нет, то runtime.assets.getProjectFileUrl() === fileName, а если есть, то runtime.assets.getProjectFileUrl() возвращает ссылку на этот файл.
	*/
	const textFileUrl = await runtime.assets.getProjectFileUrl(fileName);
	let response = null;
	let b_fail = false;
	
	try
	{
		response = await fetch(textFileUrl);
	}
	catch
	{
		b_fail = true;
	}
	
	if (b_fail)
	{
		return null;
	}
	
	let fetched = null;
	if (b_json)
	{
		fetched = await response.json();
	}
	else
	{
		fetched = await response.text();
	}
	
	return fetched;
}

export async function fetching_file_new(fileName, runtime, b_json=true) //no work.
{
	if (b_json)
	{
		return await runtime.assets.fetchJson(fileName);
	}
	else
	{
		return await runtime.assets.fetchText(fileName);
	}
}

export async function promise(fileName, runtime, delay=0, b_json=true)
{
	const string = await fetching_file(fileName, runtime, b_json);
	
	const myFirstPromise = new Promise((resolve, reject) => { //и reject тут можно не принимать.
		setTimeout(() => {resolve(string);}, delay);
	});
	
	return await myFirstPromise; //странно, но тут и без await и async в начале функции работает. и можно promise не выносить в отдельную переменную.
}

export function cssPxToLayer(e, layer, runtime) //надо бы её переписать и не использовать е. надо добавить ещё функцию layerToCssPx.
{
	return runtime.layout.getLayer(layer).cssPxToLayer(e.clientX, e.clientY);
}

export function layerToLayer(layer1, layer2, x, y, runtime)
{
	const [cssX, cssY] = runtime.layout.getLayer(layer1).layerToCssPx(x, y);
	return runtime.layout.getLayer(layer2).cssPxToLayer(cssX, cssY);
}

export function load_images(instances, runtime)
{
	for (const o of instances)
	{
		const object = runtime.objects[o];
		if (object !== undefined) //проверка на существование объекта
		{
			const instance = object.getFirstInstance();
			if (instance === null) //проверка на наличие экземпляра
			{
				runtime.callFunction("Load_Images", o);
			}
			else
			{
				instance.destroy();
			}
		}
		else
		{
			console.warn(`${o} is ${object}`);
		}
	}
}

export function shuffle(list)
{
	//Тасование Фишера — Йетса
	for (let i = list.length - 1; i > 0; i--)
	{
		const j = getRandInt(0, i);
		[list[i], list[j]] = [list[j], list[i]];
	}
	
	return list;
}

export function get_shuffle_array(count)
{
	const list = [];
	
	for (let i = 0; i < count; i++)
	{
		list.push(i);
	}
	
	return shuffle(list);
}

export function get_value_object(object, key, defaultKey)
{
	/*
	вот такой вариант еще предложил Михаил Кобычёв.
	let a = {
		var1: "asd",
		getVar1: function() { return this.var1 === undefined ? "default" : this.var1 }
	}
	*/
	if (key in object)
	{
		return object[key];
	}
	
	return object[defaultKey];
}

export function get_query_params()
{
	const paramsString = window.location.search;
	const searchParams = new URLSearchParams(paramsString);
	return searchParams;
	
	/*const lol = new URLSearchParams(window.location.search);
	const kek = Object.fromEntries(lol);
	console.log(Object.entries(kek));*/
}

async function request_time_out(url, headers, data)
{
	function fetch_time_out(url, options, timeout = 60000) //вот эта функция делает запрос с тайм-аутом (но я хз как это работает).
	{
		return Promise.race([fetch(url, options),
		new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))]);
	}
	
	const OPTIONS = {};
	OPTIONS.method = "POST";
	OPTIONS.headers = {"Content-Type": "application/json"};
	
	Object.assign(OPTIONS.headers, headers);
	OPTIONS.body = JSON.stringify(data);
	
	return await fetch_time_out(url, OPTIONS)
	.then((result) => {
		return result
	})
	.catch((e) => {
		return "time out"});
}

export async function request(url, headers, data, b_returned = true)
{
	const response = await request_time_out(url, headers, data);
	if (response["ok"] === true)
	{
		if (b_returned)
		{
			return await response.json();
		}
		else
		{
			return {};
		}
	}
	else
	{
		let result = {"status":"failed"};
		try
		{
			const j = await response.json();
			result = j;
		}
		catch
		{
			console.log('Невозможно прочитать тело запроса.');
		}
		
		return result;
	}
}

export function copy_to_buffer(text)
{
	navigator.clipboard.writeText(text).then(() => {console.log(`copy to buffer:\n${text}`);}).catch(err => {console.log('Something went wrong copy to buffer:\n${text}', err);});
}

export function fade(inTime, waitTime, outTime, currentTime, gameTime)
{
	const end = inTime + waitTime + outTime;
	const t = gameTime - currentTime;
	
	if (t > end)
	{
		return -1;
	}
	
	return clamp(Math.min(t / inTime, (t - end) / (-outTime)), 0, 1);
}

export function isometricToCartesian(x, y)
{
	const cartX = ((2 * y) + x) / 2;
	const cartY = ((2 * y) - x) / 2;
	return [cartX, cartY];
}

export function cartesianToIsometric(x, y)
{
	const isoX = x - y;
	const isoY = (x + y) / 2;
	return [isoX, isoY];
}

export function get_position_icon_text(buttonSize, iconSize, offset, textPosition, textSize_, textTextSize) //предпоследний параметр не нужен.
{
	//0 - textSize, 1 - iconPosition.
	const textSize = buttonSize - iconSize - offset;
	return [textSize, textPosition + (textSize / 2) + (textTextSize / 2) + offset];
}

export function object_is_empty(object) //@deprecated.
{
	return JSON.stringify(object) === "{}";
}

export function is_object_empty(object)
{
	return JSON.stringify(object) === "{}";
}

export function is_object_equal(object1, object2)
{
	return JSON.stringify(object1) === JSON.stringify(object2);
}

export function is_between_values(value, lowerBound, upperBound)
{
	if (value >= lowerBound && value <= upperBound)
	{
		return true;
	}
	
	return false;
}

export function hexToRGB(hex, alpha = 1) //hexToRGB("#FFFFFF", 0.5);
{
	let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	let rgb = result
	? {
		r: parseInt(result[1], 16),
		g: parseInt(result[2], 16),
		b: parseInt(result[3], 16)
	}
	: {
		r: 0,
		g: 0,
		b: 0
	};
	return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

/*export function create_SVGS(instances, runtime, SVG, layer)
{
	//надо чтобы он создавался строго на экране. значит надо растягивать еще задник, чтобы их не было видно.
	for (const instance of instances)
	{
		const svg = SVG.createInstance(layer, 0, 0);
		svg.instVars.file = `${instance}.svg`;
	}
}

export function infinity_SVGS(instances, runtime)
{
	for (const o of instances)
	{
		const object = runtime.objects[o];
		if (object != undefined) //проверка на существование объекта
		{
			const instance = object.getFirstInstance();
			if (instance != null) //проверка на наличие экземпляра
			{
				instance.x = -10000;
			}
		}
		else
		{
			console.log(`${o} is undefined`);
		}
	}
}*/

export function isPrime(n)
{
	// 1 is not a prime number
	if (n === 1)
		return false;

	// Raise to power of 1/2 takes square root
	let sqrtN = n ** 0.5;

	// Check for factors from 2 to square root of n
	for (let f = 2; f <= sqrtN; f++)
	{
		if (n % f === 0)
		{
			// Found a factor: not a prime
			return false;
		}
	}

	// Did not find any factors: is a prime
	return true;
}

export function factorialRecursion(n)
{
	if (n === 1)
	{
		return 1;
	}
	else
	{
		// Recursion happens here
		return n * factorial(n - 1);
	}
}

export function factorialFor(n)
{
	let product = 1;

	for ( ; n > 1; n--)
	{
		product *= n;
	}

	return product;
}

export function removeInstanceFromArray(instance, arr, b_instanceDestroy=true)
{
	for (let i = 0; i < arr.length; i++)
	{
		if (arr[i] === instance)
		{
			arr.splice(i, 1);
			break;
		}
	}
	
	if (b_instanceDestroy)
	{
		instance.destroy();
	}
}

export function choose(...args)
{
	const index = Math.floor(Math.random() * args.length);
	return args[index];
}

export function get_random(a, b)
{
	return (Math.random() * (b - a)) + a;
}

export function print_unloaded_objects(objectNames, objects, exceptionNamesExtra=[])
{
	const exceptionNames = [
		"Audio",
		"Browser",
		"Keyboard",
		"Touch",
	];
	
	exceptionNames.push(...exceptionNamesExtra);
	
	Object.values(objects).forEach(object => {
		const name = object.name;
		
		if (exceptionNames.includes(name)) return;
		
		if (!objectNames.includes(name)) console.warn(`Object unloaded:`, name);
	});
}

export async function print_version(runtime)
{
	const offline = await runtime.assets.fetchJson("offline.json");
	console.log('version', offline.version);
}