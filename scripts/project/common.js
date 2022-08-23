import * as Utils from "./utilities.js";
import BoxWithTick from "./box_with_tick.js";
import {LoadScript} from "./script_load.js";
import crc32 from "./crc32.js";
//import debug from "./debug.js";

runOnStartup(async runtime =>
{
	runtime.addEventListener("beforeprojectstart", () => {
		new Common(runtime);
	});
});

class Common
{
	constructor(runtime)
	{
		this.runtime = runtime;
		
		this.b_accessDenied = false;
		
		Utils.print_version(runtime);
		
		this._common();
	}
	
	async _common()
	{
		const runtime = this.runtime;
		
		this.loader = new Loader(runtime);
		
		this.config = await runtime.assets.fetchJson("config.json");
		if (this.config["b_debug"]) console.log(`%cDEBUG MODE`, `background-color: #e004bf;`);
		
		this.gameScore = new GameScore(this, this.runtime.assets, this.config);
		
		this.hud = new Hud(runtime, this);
		
		this.game = new Game(runtime, this);
		
		this.gameScore.init();
	}
	
	check_protection(checkString)
	{
		const hashes = this.config["hashes"];
		hashes.length = 2;
		
		const check = crc32(checkString);

		if (!hashes.includes(check)) return 1;
		
		if (globalThis.top.location.href !== globalThis.location.href) return 2;
		
		//странно, в document.referrer пусто, но вроде было не пусто...
		//console.log('lol', globalThis.top.location.href, document.referrer);
		//if ((document.domain !== "preview.construct.net") && (globalThis.top.location.href !== document.referrer)) return 3;
		
		return 0;
	}
}

class Loader
{
	constructor(runtime, common)
	{
		this.runtime = runtime;
		
		this.common = common;
		
		globalThis.addEventListener("image loading complete", () => {
			console.log('Image loading complete.', this.stage);
			setTimeout(() => this._load_images(), 0); //можно будет убрать после r302s.
		});
		
		this.stage = 0;
		
		this._load_images();
	}
	
	_load_images()
	{
		switch (this.stage)
		{
			case 0: this._load_textures(); break;
			case 1: this._load_textures(); break;
			case 2: 
			{
				const objectNames = [...this._get_object_names(0), ...this._get_object_names(1)];
				
				const objectNamesExtra = [
					"Text_HUD",
					"Sprite_Collision_Mask",
					"Sprite_Line",
				];
				
				Utils.print_unloaded_objects(objectNames, this.runtime.objects, objectNamesExtra);
				
				break;
			}
		}
		
		this.stage++;
	}
	
	_load_textures()
	{
		console.log('Load textures...', this.stage + 1);
		
		Utils.load_images(this._get_object_names(this.stage), this.runtime);
	}
	
	_get_object_names(index) //@task. вынести в loader.json.
	{
		const names = [
			[
				"Sprite_Background",
				"Sprite_Button",
				"Sprite_Table",
			],
			[
				"Sprite_Flower",
				"Sprite_Spider",
				"Sprite_Spider_Paw",
				"Sprite_Bee",
				"Sprite_Wing",
				"Sprite_Nectar",
				"Sprite_Hive",
			],
		];
		
		return names[index];
	}
}

class Hud
{
	constructor(runtime, common)
	{
		this.runtime = runtime;
		this.common = common;
		
		runtime.addEventListener("tick", () => this._on_tick());
		
		globalThis.addEventListener("tap gesture", e => this._on_tap_gesture(e.detail)); //переименовать в tap.
		
		//@task. нужно что-то сделать со всеми вот этими кастомными ивентами:
		globalThis.addEventListener("SDK not available", () => this._show("error", {textFirst: `Ошибка загрузки SDK`, textSecond: `Что-то пошло не так. Попробуйте ещё раз.`, buttonName: "again SDK", textButton: `Повторить`}));
		globalThis.addEventListener("adblock", () => this._show("error", {textFirst: `Обнаружен адблок`, textSecond: `Отключите адблок и перезапустите приложение`, buttonName: "reload", textButton: `Перезагрузка`}));
		globalThis.addEventListener("ads close", () => this.callbacks.fullscreenClose());
		globalThis.addEventListener("sync skip", () => this.callback());
		
		this._set_scales();
		
		this.levels = {
			"load_SDK": () => this._window_load_SDK(),
			"main": () => this._window_main(),
			"game": () => this._window_game(),
			"settings": () => this._window_settings(),
			"loss": () => this._window_loss(),
			"win": () => this._window_win(),
			"win_with_increased": () => this._window_win_with_increased(),
			"error": options => this._window_error(options),
			"sync": () => this._window_sync(),
			"purchase": options => this._window_purchase(options),
			"access denied": () => this._window_access_denied(),
		};
		
		this.level = "";
		this.objects = [];
		this.buttons = [];
		
		this.transitionSpeed = common.config["hud"]["transition speed"];
		this.transitionTime = 0;
		this.b_transitionState = false;
		this.b_transitionNext = false;
		this.transitionOptions = null;
		
		this.b_startGame = false;
		
		this.buttonPause = null;
		
		this.audio = null;
		
		this.textScore = null;
		
		this.sliderSpeed = 0.0001;
		this.vibrate = {
			slider: null,
			b_state: true
		};
		this.sound = {
			slider: null,
			b_state: true
		};
		
		this.callback = null; //@task. callback for sync. засунуть в this.callbacks.
		this.callbacks = {
			sync: null,
			fullscreenClose: null,
			purchase: null,
			paymentsUnavailable: null,
		};
		
		this.runtime.objects.Text_HUD.addEventListener("instancecreate", e => {
			const instance = e.instance;
			
			instance.fontFace = "comic"; //Comic Sans MS.
			instance.sizePt = this.common.config["hud"]["text size pt"];
			instance.fontColor = [1, 1, 1];
		});
		
		this._show("load_SDK");
		
		globalThis.addEventListener("a", () => this._click_remove_ads());
	}
	
	lose()
	{
		this._show("loss");
	}
	
	win()
	{
		this._show("win");
	}
	
	vibrate_please() //please добавил, потому что есть уже свойство vibrate.
	{
		if (!this.vibrate.b_state) return;
		
		this.runtime.callFunction("Vibrate", "100");
	}
	
	_on_tick()
	{
		this._set_transition();
		
		this._set_score_text();
		
		this._set_slider_vibrate();
		this._set_slider_sound();
		
		this._check_sdk_loaded();
	}
	
	_on_tap_gesture(options) //x, y надо, а не options. и переименовать в просто on tap.
	{
		if (this.b_transitionState && (this.transitionTime < 0.5)) return;
		
		const {x, y} = options;
		
		const buttons = this.buttons;
		for (let i = 0; i < buttons.length; i++)
		{
			const button = buttons[i];
			
			if (button.containsPoint(x, y))
			{
				this._click_on_button(button);
				return;
			}
		}
	}
	
	_set_scales()
	{
		const viewport = this.runtime.layout.getLayer("hud").getViewport();
		this.width = viewport.width;
		this.height = viewport.height;
		this.top = viewport.top;
		this.left = viewport.left;
		this.right = viewport.right;
		this.bottom = viewport.bottom;
		this.originalWidth = this.right + this.left;
		this.originalHeight = this.bottom + this.top;
		this.centerX = (this.left + this.right) / 2;
		this.centerY = (this.top + this.bottom) / 2;
		this.figmaWidth = 1440;
		this.figmaHeight = 2560;
		
		this.scale = Math.min(this.width / this.figmaWidth, this.height / this.figmaHeight);
		
		this.boxWidth = this.figmaWidth * this.scale;
		this.boxHeight = this.figmaHeight * this.scale;
		this.boxX = (this.originalWidth * 0.5) - (this.boxWidth * 0.5);
		this.boxY = (this.originalHeight * 0.5) - (this.boxHeight * 0.5);
	}

	_metamorphosis(options, b_center=false)
	{
		const {x = 0, y = 0, w = 0, h = 0} = options;
		
		const resultW = w * this.scale;
		const resultH = h * this.scale;
		
		return {
			x: (x * this.scale) + this.boxX + (b_center ? resultW / 2 : 0),
			y: (y * this.scale) + this.boxY + (b_center ? resultH / 2 : 0),
			w: resultW,
			h: resultH
		};
	}
	
	_destroy_objects()
	{
		const objects = this.objects;
		for (let i = objects.length - 1; i >= 0; i--) objects[i].destroy();
		objects.length = 0;
		
		const buttons = this.buttons;
		for (let i = buttons.length - 1; i >= 0; i--) buttons[i].destroy();
		buttons.length = 0;
	}
	
	_show(level, options=null)
	{
		this.b_transitionState = true;
		
		if (this.transitionTime >= 0.5) //я хотел это убрать, чтобы игрок случайно не пропустил какое-то окно. но оказалось это наобходимо для мгновенных переходов.
		{
			this.transitionTime = 1 - this.transitionTime;
			this.b_transitionNext = false;
		}
		
		this.level = level;
		this.transitionOptions = options;
	}
	
	_set_transition()
	{
		if (!this.b_transitionState) return;
		
		const runtime = this.runtime;
		
		this.transitionTime += runtime.dt * this.transitionSpeed;
		
		if (this.transitionTime >= 0.5)
		{
			if (!this.b_transitionNext)
			{
				this.b_transitionNext = true;
				
				this._destroy_objects();
				
				console.log(`move to`, this.level);
				
				this.levels[this.level](this.transitionOptions);
			}
		}
		
		if (this.transitionTime >= 1)
		{
			this.b_transitionState = false;
			this.transitionTime = 0;
			this.b_transitionNext = false;
		}
		
		const layer = runtime.layout.getLayer("hud");
		layer.opacity = 1 - Math.sin(this.transitionTime * Math.PI);
	}
	
	is_transition_level(level)
	{
		if (this.level !== level) return true;
		
		return !(!this.b_transitionState || (this.transitionTime >= 0.5));
	}
	
	_window_load_SDK()
	{
		//@task.
		/*
		ещё нужно сделать окно перед главным экраном что-то типа "игра загружается", пока грузится SDK. но так, чтобы был мгновенный переход когда SDK загрузилась.
		Когда грузится SDK мне надо чтоб пчела крутилась вокруг текста ЗАГРУЗКА. по часовой.
		радиус - 340 пикселей
		Расположение - у - 740, х - 380.
		Надпись - у - 1050, х - 535
		пчелу в boxWithTick добавить, чтобы она крутилась.
		*/
	}
	
	_window_main()
	{
		let th = null;
		
		this._create_button_remove_ads({coords: {x: 1044, y: 28, w: 370, h: 280}});
		
		th = this._metamorphosis({x: 363, y: 1989, w: 718, h: 394}, true);
		const buttonStartGame = this.runtime.objects.Sprite_Button.createInstance("hud", th.x, th.y);
		this._this_is_button(buttonStartGame, "start game");
		buttonStartGame.setAnimation("green");
		buttonStartGame.width = th.w;
		buttonStartGame.height = th.h;
		
		const buttonStartGameBBox = buttonStartGame.getBoundingBox();
		const textStartGame = this.runtime.objects.Text_HUD.createInstance("hud", buttonStartGameBBox.left, buttonStartGameBBox.top);
		textStartGame.width = buttonStartGame.width;
		textStartGame.height = buttonStartGame.height;
		textStartGame.text = `Начать игру`;
		textStartGame.horizontalAlign = "center";
		textStartGame.verticalAlign = "center";
		this.objects.push(textStartGame);
		
		th = this._metamorphosis({x: 28, y: 28, w: 370, h: 280}, true);
		const buttonSettings = this.runtime.objects.Sprite_Button.createInstance("hud", th.x, th.y);
		this._this_is_button(buttonSettings, "settings");
		buttonSettings.setAnimation("settings");
		buttonSettings.width = th.w;
		buttonSettings.height = th.h;
		
		th = this._metamorphosis({x: 38, y: 489, w: 1368, h: 1474});
		const tableScore = this.runtime.objects.Sprite_Table.createInstance("hud", th.x, th.y);
		this._this_is_button(tableScore, "table score");
		tableScore.setAnimation("score");
		tableScore.width = th.w;
		tableScore.height = th.h;
		
		this._play_music("menu");
		
		
		
		
		th = this._metamorphosis({x: 184, y: 784, w: 208, h: 102});
		const textNumber = this.runtime.objects.Text_HUD.createInstance("hud", th.x, th.y);
		textNumber.width = th.w;
		textNumber.height = th.h;
		textNumber.text = `№`;
		textNumber.horizontalAlign = "center";
		textNumber.verticalAlign = "center";
		textNumber.fontColor = [0, 0, 0];
		this.objects.push(textNumber);
		
		th = this._metamorphosis({x: 428, y: 784, w: 276, h: 102});
		const textName = this.runtime.objects.Text_HUD.createInstance("hud", th.x, th.y);
		textName.width = th.w;
		textName.height = th.h;
		textName.text = `Имя игрока`;
		textName.horizontalAlign = "center";
		textName.verticalAlign = "center";
		textName.fontColor = [0, 0, 0];
		this.objects.push(textName);
		
		th = this._metamorphosis({x: 738, y: 784, w: 276, h: 102});
		const textScore = this.runtime.objects.Text_HUD.createInstance("hud", th.x, th.y);
		textScore.width = th.w;
		textScore.height = th.h;
		textScore.text = `Количество очков`;
		textScore.horizontalAlign = "center";
		textScore.verticalAlign = "center";
		textScore.fontColor = [0, 0, 0];
		this.objects.push(textScore);
		
		th = this._metamorphosis({x: 1046, y: 784, w: 208, h: 102});
		const textGame = this.runtime.objects.Text_HUD.createInstance("hud", th.x, th.y);
		textGame.width = th.w;
		textGame.height = th.h;
		textGame.text = `Количество игр`;
		textGame.horizontalAlign = "center";
		textGame.verticalAlign = "center";
		textGame.fontColor = [0, 0, 0];
		this.objects.push(textScore);
	}
	
	_window_game()
	{
		let th = null;
		
		th = this._metamorphosis({x: 28, y: 28, w: 370, h: 280}, true);
		const buttonPause = this.runtime.objects.Sprite_Button.createInstance("hud", th.x, th.y);
		this._this_is_button(buttonPause, "pause");
		buttonPause.setAnimation("pause");
		buttonPause.width = th.w;
		buttonPause.height = th.h;
		this.buttonPause = buttonPause;
		
		th = this._metamorphosis({x: 1044, y: 28, w: 356, h: 268});
		const scoreBack = this.runtime.objects.Sprite_Button.createInstance("hud", th.x, th.y);
		scoreBack.setAnimation("score back");
		scoreBack.width = th.w;
		scoreBack.height = th.h;
		this.objects.push(scoreBack);
		
		const scoreBackBBox = scoreBack.getBoundingBox();
		const textScore = this.runtime.objects.Text_HUD.createInstance("hud", scoreBackBBox.left, scoreBackBBox.top);
		textScore.width = scoreBack.width;
		textScore.height = scoreBack.height;
		textScore.text = `0`;
		textScore.horizontalAlign = "center";
		textScore.verticalAlign = "center";
		this.objects.push(textScore);
		this.textScore = textScore;
		
		if (!this.b_startGame)
		{
			this.b_startGame = true;
			this.common.game.restart();
			this._play_music("game");
		}
		
		this.common.game.resume();
	}
	
	_window_settings()
	{
		const b_startGame = this.b_startGame;
		
		let th = null;
		
		th = this._metamorphosis({x: 108, y: 439, w: 1226, h: 1322});
		const tableSettings = this.runtime.objects.Sprite_Table.createInstance("hud", th.x, th.y);
		tableSettings.setAnimation("settings");
		tableSettings.animationFrame = b_startGame ? 1 : 0;
		tableSettings.width = th.w;
		tableSettings.height = th.h;
		this.objects.push(tableSettings);
		
		this._create_button_remove_ads({coords: {x: 504, y: 1107, w: 436, h: 232}, animationFrame: 1});
		
		th = this._metamorphosis({x: b_startGame ? 750 : 502, y: 1375, w: 436, h: 232}, true);
		const buttonReturn = this.runtime.objects.Sprite_Button.createInstance("hud", th.x, th.y);
		this._this_is_button(buttonReturn, b_startGame ? "return game" : "return main menu");
		buttonReturn.setAnimation("green");
		buttonReturn.animationFrame = 1;
		buttonReturn.width = th.w;
		buttonReturn.height = th.h;
		
		const buttonReturnBBox = buttonReturn.getBoundingBox();
		const textReturn = this.runtime.objects.Text_HUD.createInstance("hud", buttonReturnBBox.left, buttonReturnBBox.top);
		textReturn.width = buttonReturn.width;
		textReturn.height = buttonReturn.height;
		textReturn.text = `Вернуться`;
		textReturn.horizontalAlign = "center";
		textReturn.verticalAlign = "center";
		this.objects.push(textReturn);
		
		this.vibrate.slider = this._create_slider({x: 271, name: "vibrate", b_state: this.vibrate.b_state});
		this.sound.slider = this._create_slider({x: 757, name: "sound", b_state: this.sound.b_state});
		
		if (b_startGame)
		{
			th = this._metamorphosis({x: 254, y: 1375, w: 436, h: 232}, true);
			const buttonExit = this.runtime.objects.Sprite_Button.createInstance("hud", th.x, th.y);
			this._this_is_button(buttonExit, "exit");
			buttonExit.setAnimation("exit");
			buttonExit.width = th.w;
			buttonExit.height = th.h;
			
			const buttonExitBBox = buttonExit.getBoundingBox();
			const textExit = this.runtime.objects.Text_HUD.createInstance("hud", buttonExitBBox.left, buttonExitBBox.top);
			textExit.width = buttonExit.width;
			textExit.height = buttonExit.height;
			textExit.text = `Выйти`;
			textExit.horizontalAlign = "center";
			textExit.verticalAlign = "center";
			this.objects.push(textExit);
		}
	}
	
	_window_loss()
	{
		let th = null;
		
		th = this._metamorphosis({x: 89, y: 464, w: 1308, h: 1376});
		const table = this.runtime.objects.Sprite_Table.createInstance("hud", th.x, th.y);
		table.setAnimation("win or loss");
		table.animationFrame = 0;
		table.width = th.w;
		table.height = th.h;
		this.objects.push(table);
		
		this._create_button_remove_ads({coords: {x: 504, y: 1229, w: 436, h: 232}, animationFrame: 1, b_dark: true});
		
		this._create_text_title_table_loss({textFirst: `Поражение`, textSecond: `Набрано очков\n${this.common.game.score}`});
		
		this._create_button_yellow({x: 257, y: 1479, name: "again", text: `Заново`});
		
		const darkBackButtonContinue = this._create_dark_back_button({x: 748, y: 1510});
		
		th = this._metamorphosis({x: 753, y: 1479, w: 436, h: 232}, true);
		const buttonContinue = this.runtime.objects.Sprite_Button.createInstance("hud", th.x, th.y);
		this._this_is_button(buttonContinue, "continue");
		buttonContinue.setAnimation("green");
		buttonContinue.animationFrame = 1;
		buttonContinue.width = th.w;
		buttonContinue.height = th.h;
		buttonContinue.darkBack = darkBackButtonContinue;
		
		const buttonContinueBBox = buttonContinue.getBoundingBox();
		const textContinue = this.runtime.objects.Text_HUD.createInstance("hud", buttonContinueBBox.left, buttonContinueBBox.top);
		textContinue.width = buttonContinue.width;
		textContinue.height = buttonContinue.height;
		textContinue.text = `Сохранить ${this._get_score_retention_rate()}%\nПродолжить`;
		textContinue.horizontalAlign = "center";
		textContinue.verticalAlign = "center";
		this.objects.push(textContinue);
		buttonContinue.text = textContinue;
		
		this._set_button_rewarded_video(buttonContinue);
	}
	
	_window_win()
	{
		let th = null;
		
		th = this._metamorphosis({x: 2, y: 231, w: 1442, h: 1612});
		const table = this.runtime.objects.Sprite_Table.createInstance("hud", th.x, th.y);
		table.setAnimation("win or loss");
		table.animationFrame = 1;
		table.width = th.w;
		table.height = th.h;
		this.objects.push(table);
		
		this._create_button_remove_ads({coords: {x: 504, y: 1229, w: 436, h: 232}, animationFrame: 1, b_dark: true});
		
		this._create_button_yellow({x: 257, y: 1479, name: "continue", text: `Продолжить`});
		
		const darkBackButtonIncrease = this._create_dark_back_button({x: 748, y: 1510});
		
		th = this._metamorphosis({x: 753, y: 1479, w: 436, h: 232}, true);
		const buttonIncrease = this.runtime.objects.Sprite_Button.createInstance("hud", th.x, th.y);
		this._this_is_button(buttonIncrease, "increase");
		buttonIncrease.setAnimation("green");
		buttonIncrease.animationFrame = 1;
		buttonIncrease.width = th.w;
		buttonIncrease.height = th.h;
		buttonIncrease.darkBack = darkBackButtonIncrease;
		
		const buttonIncreaseBBox = buttonIncrease.getBoundingBox();
		const textIncrease = this.runtime.objects.Text_HUD.createInstance("hud", buttonIncreaseBBox.left, buttonIncreaseBBox.top);
		textIncrease.width = buttonIncrease.width;
		textIncrease.height = buttonIncrease.height;
		textIncrease.text = `Увеличить x2`;
		textIncrease.horizontalAlign = "center";
		textIncrease.verticalAlign = "center";
		this.objects.push(textIncrease);
		buttonIncrease.text = textIncrease;
		
		this._set_button_rewarded_video(buttonIncrease);
		
		this._create_win_border();
		
		console.log(`win with score:`, this.common.game.score);
	}
	
	_window_win_with_increased()
	{
		const th = this._metamorphosis({x: 0, y: 230, w: 1442, h: 1612});
		const table = this.runtime.objects.Sprite_Table.createInstance("hud", th.x, th.y);
		table.setAnimation("win or loss");
		table.animationFrame = 2;
		table.width = th.w;
		table.height = th.h;
		this.objects.push(table);
		
		this._create_button_remove_ads({coords: {x: 503, y: 1231, w: 436, h: 232}, animationFrame: 1, b_dark: true});
		
		this._create_button_yellow({x: 502, y: 1479, name: "continue", text: `Продолжить`});
		
		this._create_win_border();
	}
	
	_window_error(options)
	{
		const {textFirst, textSecond, buttonName, textButton} = options;
		
		this._create_table_error({animationFrame: 1});
		
		this._create_button_yellow({x: 502, y: 1472, name: buttonName, text: textButton});
		
		this._create_text_title_table_loss({textFirst, textSecond});
	}
	
	_window_sync()
	{
		this.common.gameScore.sync();
	}
	
	_window_message() //не используется.
	{
		const {textFirst, textSecond} = options;
		
		this._create_table_error({animationFrame: 0});
		
		this._create_text_title_table_loss({textFirst, textSecond});
	}
	
	_window_purchase(options)
	{
		const {callback, item} = options;
		
		this.callbacks.purchase = callback;
		
		this._create_table_message();
		
		this._create_text_title_table_loss({textFirst: `Подтверждение оплаты`, textSecond: `Пожалуйста, подождите. Это окно закроется автоматически.`});
		
		switch (item)
		{
			case "remove ads": this.common.gameScore.remove_ads(); break;
		}
	}
	
	_window_access_denied()
	{
		this._create_table_message();
		
		this._create_text_title_table_loss({textFirst: `Нелицензионная версия`, textSecond: `Было обнаружено, что вами используется пиратская версия игры. Для того, чтобы сыграть в игру, просьба перейти по ссылке (ссылка на игру в ок).`}); //@task. тут надо кнопка перейти.
	}
	
	_create_table_message()
	{
		const th = this._metamorphosis({x: 2, y: 231, w: 1442, h: 1612});
		const table = this.runtime.objects.Sprite_Table.createInstance("hud", th.x, th.y);
		table.setAnimation("message");
		table.animationFrame = 3;
		table.width = th.w;
		table.height = th.h;
		this.objects.push(table);
	}
	
	_check_sdk_loaded()
	{
		if (this.level !== "load_SDK") return;
		
		if (this.common.b_accessDenied)
		{
			this._show("access denied");
			
			return;
		}
		
		if (!this.common.gameScore.b_SDKLoaded) return;
		
		this._add_listeners_game_score();
		
		this._show("main");
	}
	
	_add_listeners_game_score()
	{
		const gs = this.common.gameScore.gs;
		
		if (gs === null) return; //@task. тут мне надо смотреть на b_debug в game_score.json, а не на nill.
		
		gs.player.on("sync", success => {
			console.log('[game score]: sync', success);
			
			if (success === true)
			{
				if (this.callback === null) return; //@bugfix #2.
				
				this.callback();
				this.callback = null;
			}
			else
			{
				this._show("error", {textFirst: `Ошибка синхронизации`, textSecond: `Необходимо повторить синхронизацию, чтобы сохранить текущий прогресс`, buttonName: "again sync", textButton: `Повторить`});
			}
		});
		
		gs.payments.on("error:purchase", error => {
			console.warn(`[game score]: error purchase`, error);
			
			let errorNumber = 0;
			let textSecond = ``;
			switch (error)
			{
				case "player_not_found":
				{
					errorNumber = 1;
					textSecond = `player_not_found`;
					break;
				}
				
				case "empty_id_or_tag":
				{
					errorNumber = 2;
					textSecond = `empty_id_or_tag`;
					break;
				}
				
				case "product_not_found":
				{
					errorNumber = 3;
					textSecond = `product_not_found`;
					break;
				}
				
				case "purchases_not_alloved_on_platform":
				{
					errorNumber = 4;
					textSecond = `purchases_not_alloved_on_platform`;
					break;
				}
				case undefined:
				{
					errorNumber = 5;
					textSecond = `undefined`;
					break;
				}
				
				default:
				{
					switch (error.message)
					{
						case "payment_rejected":
						{
							errorNumber = 6;
							textSecond = `payment_rejected`;
							break;
						}
						default:
						{
							console.log('error.message', error.message);
							
							errorNumber = 7;
							textSecond = `${error.message}`;
						}
					}
				}
			}
			
			this._show("error", {textFirst: `Покупка не удалась\nОшибка №${errorNumber}`, textSecond, buttonName: "return before error purchase", textButton: `Понятно`});
		});
		
		gs.payments.on("purchase", result => {
			console.log(`[game score]: purchase`, result["product"], result["purchase"]);
			
			this.common.gameScore.check_remove_ads_and_close_sticky();
			
			this._show("error", {textFirst: `Оплата успешно произведена`, textSecond: `Спасибо, что совершили покупку. Успехов в дальнейшей игре!`, buttonName: "return before success purchase", textButton: `Закрыть`});
		});
	}
	
	_create_table_error(options)
	{
		const {animationFrame} = options;
		
		const th = this._metamorphosis({x: 89, y: 464, w: 1308, h: 1376});
		const table = this.runtime.objects.Sprite_Table.createInstance("hud", th.x, th.y);
		table.setAnimation("message");
		table.animationFrame = animationFrame;
		table.width = th.w;
		table.height = th.h;
		this.objects.push(table);
	}
	
	_create_text_title_table_loss(options)
	{
		const {textFirst, textSecond} = options;
		
		let th = null;
		
		th = this._metamorphosis({x: 291, y: 605, w: 856, h: 272});
		const textTitle = this.runtime.objects.Text_HUD.createInstance("hud", th.x, th.y);
		textTitle.width = th.w;
		textTitle.height = th.h;
		textTitle.text = textFirst;
		textTitle.horizontalAlign = "center";
		textTitle.verticalAlign = "center";
		this.objects.push(textTitle);
		
		th = this._metamorphosis({x: 255, y: 943, w: 925, h: 287}); //на счёт wh не уверен.
		const textScore = this.runtime.objects.Text_HUD.createInstance("hud", th.x, th.y);
		textScore.width = th.w;
		textScore.height = th.h;
		textScore.text = textSecond;
		textScore.horizontalAlign = "center";
		textScore.verticalAlign = "center";
		this.objects.push(textScore);
	}
	
	_create_button_yellow(options)
	{
		const {x, y, name, text} = options;
		
		const th = this._metamorphosis({x, y, w: 436, h: 232}, true);
		const button = this.runtime.objects.Sprite_Button.createInstance("hud", th.x, th.y);
		this._this_is_button(button, name);
		button.setAnimation("yellow");
		button.width = th.w;
		button.height = th.h;
		
		const buttonBBox = button.getBoundingBox();
		const textInstance = this.runtime.objects.Text_HUD.createInstance("hud", buttonBBox.left, buttonBBox.top);
		textInstance.width = button.width;
		textInstance.height = button.height;
		textInstance.text = text;
		textInstance.horizontalAlign = "center";
		textInstance.verticalAlign = "center";
		this.objects.push(textInstance);
	}
	
	_create_button_remove_ads(options)
	{
		if (this.common.gameScore.is_remove_ads_purchased()) return;
		
		const {coords, animationFrame = 0, b_dark = false} = options;
		
		if (b_dark) this._create_dark_remove_ads();
		
		const th = this._metamorphosis(coords, true);
		const buttonRemoveAds = this.runtime.objects.Sprite_Button.createInstance("hud", th.x, th.y);
		this._this_is_button(buttonRemoveAds, "remove ads");
		buttonRemoveAds.setAnimation("remove ads");
		buttonRemoveAds.animationFrame = animationFrame;
		buttonRemoveAds.width = th.w;
		buttonRemoveAds.height = th.h;
		
		const buttonRemoveAdsBBox = buttonRemoveAds.getBoundingBox();
		const textRemoveAds = this.runtime.objects.Text_HUD.createInstance("hud", buttonRemoveAdsBBox.left, buttonRemoveAdsBBox.top);
		textRemoveAds.width = buttonRemoveAds.width;
		textRemoveAds.height = buttonRemoveAds.height;
		textRemoveAds.text = `Убрать\nрекламу`;
		textRemoveAds.horizontalAlign = "center";
		textRemoveAds.verticalAlign = "center";
		this.objects.push(textRemoveAds);
	}
	
	_create_dark_remove_ads() //@task. объединить с нижним методом _create_dark_back_button.
	{
		const th = this._metamorphosis({x: 495, y: 1259, w: 448, h: 206});
		const darkRemoveAds = this.runtime.objects.Sprite_Button.createInstance("hud", th.x, th.y);
		darkRemoveAds.setAnimation("dark");
		darkRemoveAds.width = th.w;
		darkRemoveAds.height = th.h;
		this.objects.push(darkRemoveAds);
	}
	
	_create_dark_back_button(options)
	{
		const {x, y} = options;
		
		const th = this._metamorphosis({x, y, w: 448, h: 206});
		const darkBackButton = this.runtime.objects.Sprite_Button.createInstance("hud", th.x, th.y);
		darkBackButton.setAnimation("dark");
		darkBackButton.width = th.w;
		darkBackButton.height = th.h;
		this.objects.push(darkBackButton);
		
		return darkBackButton;
	}
	
	_create_win_border()
	{
		let th = null;
		
		th = this._metamorphosis({x: 291, y: 605, w: 856, h: 272});
		const textTitle = this.runtime.objects.Text_HUD.createInstance("hud", th.x, th.y);
		textTitle.width = th.w;
		textTitle.height = th.h;
		textTitle.text = `Победа`;
		textTitle.horizontalAlign = "center";
		textTitle.verticalAlign = "center";
		this.objects.push(textTitle);
		
		th = this._metamorphosis({x: 255, y: 943, w: 925, h: 287}); //на счёт wh не уверен.
		const textScore = this.runtime.objects.Text_HUD.createInstance("hud", th.x, th.y);
		textScore.width = th.w;
		textScore.height = th.h;
		textScore.text = `Набрано очков\n${this.common.game.score}`;
		textScore.horizontalAlign = "center";
		textScore.verticalAlign = "center";
		this.objects.push(textScore);
	}
	
	_create_slider(options)
	{
		const {x, name, b_state} = options;
		
		let th = null;
		
		th = this._metamorphosis({x, y: 740, w: 414, h: 202});
		const sliderBack = this.runtime.objects.Sprite_Button.createInstance("hud", th.x, th.y);
		this._this_is_button(sliderBack, name);
		sliderBack.setAnimation("slider back");
		sliderBack.width = th.w;
		sliderBack.height = th.h;
		this.objects.push(sliderBack);
		
		const right = x + 190;
		th = this._metamorphosis({x: b_state ? right : x, y: 712, w: 226, h: 232});
		const sliderFront = this.runtime.objects.Sprite_Button.createInstance("hud", th.x, th.y);
		sliderFront.setAnimation(name);
		sliderFront.width = th.w;
		sliderFront.height = th.h;
		this.objects.push(sliderFront);
		
		th = this._metamorphosis({x});
		sliderFront.left = th.x;
		th = this._metamorphosis({x: right});
		sliderFront.right = th.x;
		
		sliderBack.sliderFront = sliderFront;
		
		return sliderBack;
	}
	
	_this_is_button(button, name)
	{
		button.name = name;
		this.buttons.push(button);
	}
	
	_play_music(playTag)
	{
		if (!this.sound.b_state) return;
		
		if (this.audio === playTag) return;
		
		if (this.audio !== null) this._stop_music();
		
		this.audio = playTag;
		
		if (!this.common.config["b_debug"])
		{
			const names = {
				"game": "JoshWoodward-TheWake-NoVox-08-WaterInTheCreek",
				"menu": "JoshWoodward-OW-NoVox-08-EastSideBar",
			};
			
			this.runtime.callFunction("Play_Music", names[playTag], playTag);
		}
	}
	
	_stop_music()
	{
		this.runtime.callFunction("Stop_Music", this.audio);
		this.audio = null;
	}
	
	_set_score_text()
	{
		if (this.is_transition_level("game")) return;
		
		this.textScore.text = `${this.common.game.score}`;
	}
	
	_set_slider_vibrate()
	{
		if (this.is_transition_level("settings")) return;
		
		const vibrate = this.vibrate;
		const slider = vibrate.slider;
		
		vibrate.slider.animationFrame = vibrate.b_state ? 1 : 0;
		
		const sliderFront = slider.sliderFront;
		sliderFront.animationFrame = slider.animationFrame;
		const end = vibrate.b_state ? sliderFront.right : sliderFront.left;
		sliderFront.x = Utils.lerp_dt(sliderFront.x, end, this.sliderSpeed, this.runtime.dt);
	}
	
	_set_slider_sound()
	{
		if (this.is_transition_level("settings")) return;
		
		const sound = this.sound;
		const slider = sound.slider;
		
		slider.animationFrame = sound.b_state ? 1 : 0;
		
		const sliderFront = slider.sliderFront;
		sliderFront.animationFrame = slider.animationFrame;
		const end = sound.b_state ? sliderFront.right : sliderFront.left;
		sliderFront.x = Utils.lerp_dt(sliderFront.x, end, this.sliderSpeed, this.runtime.dt);
	}
	
	_show_ads_fullscreen(callback)
	{
		this.callbacks.fullscreenClose = callback;
		
		this.common.gameScore.show_ads_fullscreen();
	}
	
	async _show_rewarded_video(callbackIfSuccess, callbackElse)
	{
		const success = await this.common.gameScore.show_rewarded_video();
		
		if (success) callbackIfSuccess();
		else
		{
			console.warn('[game score]:', 'ads was overlooked.');
			callbackElse();
		}
	}
	
	_set_button_rewarded_video(button)
	{
		button.saveName = button.name;
		
		const boxWithTick = new BoxWithTick();
		
		boxWithTick.append(button, () => {
			const b_available = this.common.gameScore.is_rewarded_video_available();
			button.name = b_available ? button.saveName : "";
			button.isVisible = b_available;
			button.text.isVisible = b_available;
			button.darkBack.isVisible = b_available;
		});
	}
	
	_push_score()
	{
		const game = this.common.game;
		
		if (game.score === 0) return false;
		
		this.common.gameScore.add_score(game.score);
		game.score = 0;
		
		return true;
	}
	
	_sync(callback)
	{
		this.callback = callback;
		
		this._show("sync");
	}
	
	_push_score_and_show_fullscreen_ads_and_move_to_game()
	{
		const callback = () => this._show_ads_fullscreen(() => {
			this.b_startGame = false;
			this._show("game");
		});
		
		this._push_score() === true ? this._sync(callback) : callback();
	}
	
	_get_score_retention_rate()
	{
		const common = this.common;
		const arr = common.config["score retention rate"];
		const index = common.game.scoreRetentionRateIndex;
		return arr[Math.min(index, arr.length - 1)] * 100;
	}
	
	_set_score_retention_rate()
	{
		const common = this.common;
		const arr = common.config["score retention rate"];
		const game = common.game;
		const index = game.scoreRetentionRateIndex;
		
		const k = arr[Math.min(index, arr.length - 1)];
		
		game.score *= k;
		
		game.score = Math.ceil(game.score);
		
		game.scoreRetentionRateIndex++;
	}
	
	_click_remove_ads()
	{
		const gameScore = this.common.gameScore;
		
		if (gameScore.b_debug) return;
		
		const level = this.level;
		const callback = () => this._show(level);
		
		if (gameScore.is_payments_available())
		{
			this._show("purchase", {callback, item: "remove ads"});
		}
		else
		{
			this.callbacks.purchaseUnavailable = callback;
			
			this._show("error", {textFirst: `Платежи не поддерживаются`, textSecond: `Платежи не поддерживаются на данной платформе.`, buttonName: "return before purchase unavailable", textButton: `Закрыть`});
		}
	}
	
	_click_on_button(button)
	{
		const name = button.name;
		
		this.vibrate_please();
		
		switch (this.level)
		{
			case "main":
			{
				switch (name)
				{
					case "start game":
					{
						this._show("game");
						
						break;
					}
					
					case "settings":
					{
						this._show("settings");
						
						break;
					}
					
					case "table score":
					{
						this.common.gameScore.show_leaderboard();
						
						break;
					}
					
					break;
				}
				
				break;
			}
			
			case "settings":
			{
				switch (name)
				{
					case "return main menu":
					{
						this._show("main");
						
						break;
					}
					
					case "return game":
					{
						this._show("game");
						
						break;
					}
					
					case "exit":
					{
						this.common.game.destroy();
						this.b_startGame = false;
						this._show("main");
						
						break;
					}
					
					case "vibrate":
					{
						this.vibrate.b_state = !this.vibrate.b_state;
						
						break;
					}
					
					case "sound":
					{
						//@task вынести в отдельный метод.
						this.sound.b_state = !this.sound.b_state;
						if (this.sound.b_state) this._play_music(this.b_startGame ? "game" : "menu");
						else this._stop_music();
						
						break;
					}
				}
				break;
			}
			
			case "game":
			{
				switch (name)
				{
					case "pause":
					{
						this.common.game.pause();
						this._show("settings");
						
						break;
					}
				}
				break;
			}
			
			case "loss":
			{
				switch (name)
				{
					case "again":
					{
						this._push_score_and_show_fullscreen_ads_and_move_to_game();
						
						break;
					}
					
					case "continue":
					{
						this._show_rewarded_video(() => {
							this.common.game.set_bee_to_last_flower();
							this._set_score_retention_rate();
							this._show("game");
						}, () => null);
						
						break;
					}
				}
				break;
			}
			
			case "win":
			{
				switch (name)
				{
					case "continue":
					{
						this._push_score_and_show_fullscreen_ads_and_move_to_game();
						
						break;
					}
					
					case "increase":
					{
						this._show_rewarded_video(() => {
							this.common.game.score *= 2;
							this._show("win_with_increased");
						}, () => null);
						
						break;
					}
				}
				break;
			}
			
			case "win_with_increased":
			{
				switch (name)
				{
					case "continue":
					{
						const callback = () => {
							this.b_startGame = false;
							this._show("game");
						};
						
						this._push_score() === true ? this._sync(callback) : callback();
						
						break;
					}
				}
				break;
			}
			
			case "error":
			{
				switch (name)
				{
					case "again sync":
					{
						this._show("sync");
						
						break;
					}
					
					case "again SDK":
					{
						this.common.gameScore.init();
						this._show("load_SDK");
						
						break;
					}
					
					case "reload":
					{
						this.runtime.callFunction("Reload");
						
						break;
					}
					
					case "return before error purchase":
					{
						this.callbacks.purchase();
						
						break;
					}
					
					case "return before success purchase":
					{
						this._sync(() => this.callbacks.purchase());
						
						break;
					}
					
					case "return before purchase unavailable":
					{
						this.callbacks.purchaseUnavailable();
						
						break;
					}
				}
				
				break;
			}
		}
		
		if (name === "remove ads")
		{
			this._click_remove_ads();
			
			return;
		}
	}
}

class Game
{
	constructor(runtime, common)
	{
		this.runtime = runtime;
		this.common = common;
		
		this.runtime.addEventListener("tick", () => this._on_tick());
		this.runtime.addEventListener("pointerdown", e => this._on_pointerdown(e));
		
		globalThis.addEventListener("restart", () => this.restart()); //@debug.
		
		this._set_flower_radius();
		
		Bee.instances = [];
		Flower.init();
		Web.instances = [];
		
		this.replacer = {
			0: "",
			1: "flower",
			2: "twin",
			3: "web",
			4: "hive",
		};
		
		this.border = {left: 0, right: 720};
		
		this.cameraY = null;
		
		this._create_background();
		
		this._create_lines();
		
		this.b_pause = true;
		this.b_loss = false;
		
		this.score = 0;
		this.scoreRetentionRateIndex = 0;
	}
	
	restart()
	{
		this.b_loss = false;
		
		this.score = 0;
		this.scoreRetentionRateIndex = 0;
		
		this.destroy();
		
		this._change_background();
		
		this._generate_objects();
		
		//в отдельный метод:
		const flowers = Flower.instances;
		flowers.forEach((flower, index) => flower.thirdIndex = get_third(index, flowers.length));
		
		this._create_bee();
		
		this._camera_restart();
	}
	
	set_bee_to_last_flower()
	{
		this.b_loss = false;
		
		const bee = this.bee;
		const flower = this.bee.flower;
		if (flower !== null)
		{
			const flowerSprite = flower.sprite;
		
			bee.x = flowerSprite.x;
			bee.y = flowerSprite.y;
			bee.set_state("rotate");
		}
		else
		{
			const numberFlower = Math.floor(bee.flowerBeeAngle / Utils.TWO_PI) % 2;
			const flowerTwin = bee.flowers[numberFlower];
			
			const flowerSprite = flowerTwin.sprite;
		
			bee.x = flowerSprite.x;
			bee.y = flowerSprite.y;
			bee.set_state("rotate infinity");
		}
	}
	
	pause()
	{
		this.b_pause = true;
	}
	
	resume()
	{
		this.b_pause = false;
	}
	
	destroy()
	{
		Flower.destroy_all();
		this._destroy_bees();
		this.runtime.objects.Sprite_Nectar.getAllInstances().forEach(nectar => nectar.destroy()); //в отдельный метод.
		this._destroy_spiders();
		this.runtime.objects.Sprite_Hive.getAllInstances().forEach(hive => hive.destroy()); //в отдельный метод.
	}
	
	_on_tick()
	{
		if (this.b_pause) return;
		
		this._set_camera();
		
		this._set_lines();
		
		if (!this.b_loss)
		{
			this._check_collision_bee_and_flowers();
			this._check_collision_bee_and_nectars();
			this._check_collision_bee_and_web();
			this._check_collision_bee_and_hive();
			this._check_outside_viewport_bee();
		}
		
		this._bee_tick();
		
		this._flowers_tick();
		
		this._set_nectar_opacity();
		
		this._spider_tick();
	}
	
	_on_pointerdown(e)
	{
		if (this.b_pause) return;
		
		if (this.b_loss) return;
		
		const {clientX, clientY} = e;
		const [x, y] = this.runtime.layout.getLayer("hud").cssPxToLayer(clientX, clientY); //@task. заюзать в utilities функцию.
		if ((this.common.hud.level === "game") && this.common.hud.buttonPause.containsPoint(x, y)) return;
		
		this._bee_line(); //@debug.
		
		this.bee.set_state("jump");
		
		this.common.hud.vibrate_please();
	}
	
	_bee_line()
	{
		if (this.bee.state === "rotate")
		{
			const flowerSprite = this.bee.flower.sprite;
			this.bee.moveAngle = Utils.angleRadians(flowerSprite.x, flowerSprite.y, this.bee.x, this.bee.y);
		}
		if (this.bee.state === "rotate infinity")
		{
			const numberFlower = Math.floor(this.bee.flowerBeeAngle / Utils.TWO_PI) % 2;
			const flower = this.bee.flowers[numberFlower];
			this.bee.moveAngle = Utils.angleRadians(flower.sprite.x, flower.sprite.y, this.bee.x, this.bee.y);
		}
	}
	
	get _quarter_height_screen()
	{
		return this._get_viewport("middleground").height / 4;
	}
	
	_get_viewport(layer)
	{
		return this.runtime.layout.getLayer(layer).getViewport();
	}
	
	_get_center_x(layer)
	{
		const viewport = this._get_viewport(layer);
		return (viewport.left + viewport.right) / 2;
	}
	
	_get_center_y(layer)
	{
		const viewport = this._get_viewport(layer);
		return (viewport.top + viewport.bottom) / 2;
	}
	
	_set_flower_radius()
	{
		const flowerRadius = this.common.config["flower"]["radius min and max"];
		this.flowerRadius = {min: flowerRadius[0], max: flowerRadius[1]};
	}
	
	_create_background()
	{
		const viewport = this._get_viewport("background");
		
		const background = this.runtime.objects.Sprite_Background.createInstance("background", this._get_center_x("background"), this._get_center_y("background"));
		this.background = background;
		const scale = Math.max(viewport.width / background.width, viewport.height / background.height);
		background.width *= scale;
		background.height *= scale;
	}
	
	_change_background()
	{
		const background = this.background;
		
		background.animationFrame = Utils.getRandInt(0, background.animation.frameCount - 1);
	}
	
	_create_lines()
	{
		if (!this.common.config["b_debug"]) return;
		
		const viewport = this._get_viewport("middleground");
		const centerX = this._get_center_x("middleground");
		const centerY = this._get_center_y("middleground");
		
		this.linesHorizontal = [];
		
		for (let i = 0; i < 3; i++)
		{
			const line = this.runtime.objects.Sprite_Line.createInstance("middleground", centerX, 0);
			line.width = viewport.width;
			line.height *= 2;
			line.opacity = 0.25;
			this.linesHorizontal.push(line); //переименовать в linesHorizontal.
		}
		
		this.linesVertical = [];
		const range = this.common.config["flower"]["spawn horizontal range"];
		const height = viewport.height;
		
		[-range, range].forEach(offset => {
			const line = this.runtime.objects.Sprite_Line.createInstance("middleground", centerX + offset, centerY);
			line.width *= 2;
			line.height = height;
			line.opacity = 0.25;
			
			this.linesVertical.push(line);
		});
	}
	
	_set_lines()
	{
		if (!this.common.config["b_debug"]) return;
		
		this.linesHorizontal.forEach((line, index) => {
			
			line.y = this._get_viewport("middleground").top + ((index + 1) * this._quarter_height_screen);
		});
		
		this.linesVertical.forEach((line, index) => {
			
			line.y = this._get_center_y("middleground");
		});
	}
	
	_set_camera()
	{
		const layout = this.runtime.layout;
		const viewportStart = this.viewportGameStart;
		const speed = this.common.config["camera"]["speed"];
		const scrollY = Utils.lerp_dt(layout.scrollY, this._get_scroll_y_from_flower_and_bee(), speed, this.runtime.dt);
		
		layout.scrollY = scrollY;
	}
	
	_get_scroll_y_from_flower_and_bee()
	{
		const bee = this.bee;
		
		/*let y = Flower.instances[0].sprite.y;
		if (bee.flowers.length > 0) y = bee.flowers[0].middleY;
		if (bee.flower !== null) y = bee.flower.sprite.y;*/
		
		const y = this.cameraY;
		
		const offset = this.common.config["camera"]["offset"];
		return Utils.lerp(y, bee.y, offset) - this._quarter_height_screen;
	}
	
	_check_collision_bee_and_flowers()
	{
		const bee = this.bee;
		//const beeSprite = bee.sprite;
		const flowers = Flower.instances;
		
		for (let i = flowers.length - 1; i >= 0; i--)
		{
			const flower = flowers[i];
			const flowerSprite = flower.sprite;
			
			const deltaX = bee.x - flowerSprite.x;
			const deltaY = bee.y - flowerSprite.y;
			const radius = flower.radius + bee.radius;
			if (((deltaX * deltaX) + (deltaY * deltaY)) > (radius * radius)) continue;
			
			if (bee.flower === flower) continue;
			if (bee.flowers.includes(flower)) continue;
			
			const startFlowerBeeAngle = Utils.angleRadians(bee.jumpX, bee.jumpY, flowerSprite.x, flowerSprite.y);
			const flowerBeeAngle = Utils.angleRadians(bee.jumpX, bee.jumpY, bee.x, bee.y);
			bee.direction = Utils.sign(startFlowerBeeAngle - flowerBeeAngle);
			
			bee.reset_speed();
			
			switch (flower.type)
			{
				case "":
				{
					this.cameraY = flowerSprite.y;
					bee.set_flower(flower);
					bee.set_state("rotate");
					break;
				}
				
				case "infinity":
				{
					this.cameraY = flower.middleY;
					bee.set_flowers(flower, flower.twinFlower);
					bee.set_state("rotate infinity");
					break;
				}
			}
			
			this.common.hud.vibrate_please();
		}
	}
	
	_check_collision_bee_and_nectars()
	{
		const bee = this.bee;
		const beeSprite = bee.sprite;
		const nectars = this.runtime.objects.Sprite_Nectar.getAllInstances();
		
		const score = [3, 5, 7];
		
		for (let i = nectars.length - 1; i >= 0; i--)
		{
			const nectar = nectars[i];
			
			if (nectar.state === "fade") continue;
			
			const deltaX = beeSprite.x - nectar.x;
			const deltaY = beeSprite.y - nectar.y;
			const radius = nectar.radius + bee.radius;
			if (((deltaX * deltaX) + (deltaY * deltaY)) > (radius * radius)) continue;
			
			nectar.state = "fade";
			
			const addScore = score[nectar.flower.thirdIndex];
			this.score += addScore;
			
			this.common.hud.vibrate_please();
		}
	}
	
	_check_collision_bee_and_web()
	{
		const bee = this.bee;
		const webs = Web.instances;
		
		for (let i = webs.length - 1; i >= 0; i--)
		{
			const web = webs[i];
			const webSprite = web.sprite;
			
			const deltaX = bee.x - webSprite.x;
			const deltaY = bee.y - webSprite.y;
			const radius = (web.radius / 2) + bee.radius;
			if (((deltaX * deltaX) + (deltaY * deltaY)) > (radius * radius)) continue;
			
			this.cameraY = webSprite.y;
			const nextFlowerSprite = web.nextFlower.sprite;
			const angle = Utils.angleRadians(bee.x, bee.y, nextFlowerSprite.x, nextFlowerSprite.y);
			bee.set_angle(angle);
			
			this.common.hud.vibrate_please();
		}
	}
	
	_check_collision_bee_and_hive()
	{
		const bee = this.bee;
		const hives = this.runtime.objects.Sprite_Hive.getAllInstances();
		
		for (let i = hives.length - 1; i >= 0; i--)
		{
			const hive = hives[i];
			
			if (hive.b_state) continue;
			
			const deltaX = bee.x - hive.x;
			const deltaY = bee.y - hive.y;
			const radius = hive.radius + bee.radius;
			if (((deltaX * deltaX) + (deltaY * deltaY)) > (radius * radius)) continue;
			
			hive.b_state = true;
			
			this.cameraY = hive.y + 500; //500 на глаз.
			
			bee.hive = hive;
			bee.hiveRadius = radius;
			
			const startHiveBeeAngle = Utils.angleRadians(bee.jumpX, bee.jumpY, hive.x, hive.y);
			const hiveBeeAngle = Utils.angleRadians(bee.jumpX, bee.jumpY, bee.x, bee.y);
			bee.direction = Utils.sign(startHiveBeeAngle - hiveBeeAngle);
			
			bee.set_state("hive");
			
			this.common.game.b_loss = true;
		}
	}
	
	_check_outside_viewport_bee()
	{
		if (this.runtime.keyboard.isKeyDown("ShiftLeft")) return; //@debug.
		
		const viewport = this._get_viewport("bee");
		const bee = this.bee;
		if ((bee.x < viewport.left) || (bee.x > viewport.right) || (bee.y < viewport.top) || (bee.y > viewport.bottom))
		{
			this.b_loss = true;
			this.common.hud.lose();
		}
	}
	
	_get_array_generation()
	{
		const [countMin, countMax] = this.common.config["flower"]["count spawn min and max"];
		const count = Utils.getRandInt(countMin, countMax);
		const result = [1];
		let counter = 0;
		
		while (result.length < count)
		{
			const randomValue = Utils.getRandInt(0, 1);
			
			if (randomValue === 0) counter++;
			if (randomValue === 1) counter = 0;
			
			if (counter > 1)
			{
				continue;
			}
			
			result.push(randomValue);
		}
		
		return this._post_processing(result);
	}
	
	_post_processing(arr)
	{
		for (let i = 0; i < arr.length; i++)
		{
			const current = arr[i];
			const previous = arr[i - 1];
			const next = arr[i + 1];
			
			if ((current === 1) && (previous === 0) && (next === 0)) arr[i] = Utils.choose(1, 2);
		}
		
		for (let i = 0; i < arr.length; i++)
		{
			const current = arr[i];
			const previous = arr[i - 1];
			const next = arr[i + 1];
			
			if ((current === 1) && (previous === 1) && (next === 1)) arr[i] = Utils.choose(1, 3);
		}
		
		if (arr.at(-1) !== 0) arr.push(0);
		arr.push(4);
		
		for (let i = 0; i < arr.length; i++)
		{
			const current = arr[i];
			
			arr[i] = this.replacer[current];
		}
		
		return arr;
	}
	
	_generate_objects()
	{
		const arrayGeneration = this._get_array_generation();
		this._print_map(arrayGeneration);
		
		const {min: flowerRadiusMin, max: flowerRadiusMax} = this.flowerRadius;
		const config = this.common.config;
		const range = config["flower"]["spawn horizontal range"];
		
		const centerX = this._get_center_x("middleground");
		const viewport = this._get_viewport("middleground");
		
		const webSize = config["web"]["size"];
		const webOffsetX = config["web"]["offset x"];
		
		const border = this.border;
		
		for (let i = 0; i < arrayGeneration.length; i++)
		{
			const element = arrayGeneration[i];
			const y = i * -this._quarter_height_screen;
			
			switch (element)
			{
				case "flower":
				{
					/*const layout = this.runtime.layout;
					const viewport = layout.getLayer("middleground").getViewport();
					const offsetX = 200;
					const x = Utils.getRandInt(viewport.left + offsetX, viewport.right - offsetX);*/
					
					const previous = arrayGeneration[i - 1];
					
					const x = centerX + Utils.get_random(-range + flowerRadiusMax, range - flowerRadiusMax);
					
					const radius = Utils.get_random(flowerRadiusMin, flowerRadiusMax);
					const flower = this._create_flower({x, y, radius, type: "", addAngle: 0, inclineAngle: 0});
					if (previous === "web")
					{
						const lastWeb = Web.instances.at(-1);
						lastWeb.set_flower(flower);
						
						const start = lastWeb.sprite.x + (webOffsetX * lastWeb.side);
						const end = lastWeb.side === 1 ? border.right - flower.radius : border.left + flower.radius;
						const x = Utils.get_random(start, end);
						flower.set_x(x);
					}
					
					break;
				}
				
				case "twin":
				{
					const x = centerX + Utils.get_random(-range + (flowerRadiusMax * 2), range - (flowerRadiusMax * 2));
					this._create_twin_flowers(x, y);
					break;
				}
				
				case "web":
				{
					const lastFlower = Flower.instances.at(-1);
					const side = this._get_side_object_on_screen(lastFlower.sprite.x);
					const web = new Web(this.runtime, {x: 0, y, size: webSize, side, config});
					
					const start = lastFlower.sprite.x + (webOffsetX * -side);
					const end = side === -1 ? border.right - web.radius : border.left + web.radius;
					const x = Utils.get_random(start, end);
					web.set_x(x);
					
					break;
				}
				
				case "hive":
				{
					const boxWithTick = new BoxWithTick();
					
					const size = config["hive"]["size"];
					const hive = this.runtime.objects.Sprite_Hive.createInstance("middleground", centerX, y);
					hive.width *= size;
					hive.height *= size;
					hive.radius = hive.width / 2;
					hive.b_state = false;
					hive.velocityX = hive.width;
					hive.velocityY = hive.height;
					const startWidth = hive.width;
					const startHeight = hive.height;
					boxWithTick.append(hive, () => {
						const ratio = 0.8;
						const speed = 10 * this.runtime.dt;
						hive.velocityX = Utils.springing(hive.velocityX, hive.width, startWidth, ratio, speed);
						hive.velocityY = Utils.springing(hive.velocityY, hive.height, startHeight, ratio, speed);
						hive.width += hive.velocityX;
						hive.height += hive.velocityY;
					});
					
					break;
				}
			}
		}
	}
	
	_create_bee()
	{
		const firstFlowerSprite = Flower.instances[0].sprite;
		
		const config = this.common.config;
		const configBee = config["bee"];
		const size = configBee["size"];
		const speed = configBee["speed"];
		const smooth = configBee["smooth"];
		const configWings = configBee["wings"];
		const wingsSpeed = configWings["speed"];
		const wingsOffset = configWings["offset"];
		const bee = new Bee(this.runtime, {x: firstFlowerSprite.x, y: firstFlowerSprite.y + 200, size, speed, smooth, wingsSpeed, wingsOffset}, this.common);
		this.bee = bee;
		//this.set_state("jump");
	}
	
	_create_twin_flowers(x, y)
	{
		const inclineAngle = Math.random() * Math.PI;
		const {min: flowerRadiusMin, max: flowerRadiusMax} = this.flowerRadius;
		const firstRadius = Utils.get_random(flowerRadiusMin, flowerRadiusMax);
		const secondRadius = Utils.get_random(flowerRadiusMin, flowerRadiusMax);
		
		const x1 = x - (Math.cos(inclineAngle) * firstRadius);
		const y1 = y - (Math.sin(inclineAngle) * firstRadius);
		
		const x2 = x + (Math.cos(inclineAngle) * secondRadius);
		const y2 = y + (Math.sin(inclineAngle) * secondRadius);
		
		const middleY = (y1 + y2) / 2;
		
		const type = "infinity";
		const firstFlower = this._create_flower({x: x1, y: y1, radius: firstRadius, type, addAngle: 0, inclineAngle, middleY});
		const secondFlower = this._create_flower({x: x2, y: y2, radius: secondRadius, type, addAngle: Math.PI, inclineAngle, middleY});
		firstFlower.set_twin_flower(secondFlower);
		secondFlower.set_twin_flower(firstFlower);
	}
	
	_create_flower(options)
	{
		const config = this.common.config;
		const nectarConfig = config["flower"]["nectar"];
		const nectarMinAndMax = nectarConfig["spawn count min and max"];
		const nectarSize = nectarConfig["size"];
		const nectarSpawnRadius = nectarConfig["spawn radius"];
		
		const nectarOptions = {nectarMinAndMax, size: nectarSize, spawnRadius: nectarSpawnRadius};
		
		return new Flower(this.runtime, this.common, options, nectarOptions);
	}
	
	_set_nectar_opacity()
	{
		const runtime = this.runtime;
		const nectars = runtime.objects.Sprite_Nectar.getAllInstances();
		const fadeTime = this.common.config["flower"]["nectar"]["fade time"];
		for (let i = nectars.length - 1; i >= 0; i--)
		{
			const nectar = nectars[i];
			
			if (nectar.state !== "fade") continue;
			
			nectar.opacity -= runtime.dt * fadeTime;
			
			if (nectar.opacity === 0)
			{
				nectar.destroy();
			}
		}
	}
	
	_destroy_bees()
	{
		const bees = Bee.instances;
		bees.forEach(bee => bee.destroy());
		bees.length = 0;
	}
	
	_bee_tick()
	{
		const bees = Bee.instances;
		for (let i = 0; i < bees.length; i++) bees[i].tick();
	}
	
	_flowers_tick()
	{
		const flowers = Flower.instances;
		for (let i = 0; i < flowers.length; i++) flowers[i].tick();
	}
	
	_destroy_spiders()
	{
		const spiders = Web.instances;
		spiders.forEach(spider => spider.destroy());
		spiders.length = 0;
	}
	
	_spider_tick()
	{
		const spiders = Web.instances; //как там несколько переменных в цикле объявлять?
		for (let i = 0; i < spiders.length; i++) spiders[i].tick();
	}
	
	_get_side_object_on_screen(x)
	{
		return x >= this._get_center_x("middleground") ? 1 : -1;
	}
	
	_print_map(map)
	{
		const result = [];
		for (let i = 0; i < map.length; i++)
		{
			const current = map[i];
			
			for (const [key, val] of Object.entries(this.replacer))
			{
				if (current === val) result.push(Number(key));
				continue;
			}
		}
		
		console.log(result);
	}
	
	_camera_restart()
	{
		this.cameraY = null;
		this.runtime.layout.scrollY = this._get_scroll_y_from_flower_and_bee();
	}
}

function get_third(index, count)
{
	const a = count / 3;
	const b = count * (2 / 3);
	if (index <= a) return 0;
	if (index <= b) return 1;
	return 2;
}

class Flower
{
	constructor(runtime, common, options, nectarOptions)
	{
		Flower.instances.push(this);
		
		this.runtime = runtime;
		this.common = common;
		
		const {x, y, radius, type, addAngle, inclineAngle, middleY} = options;
		
		const animationFrames = {
			"": [0, 5],
			"infinity": [4, 5],
		};
		const [animationFrameMin, animationFrameMax] = animationFrames[type];
		
		const sprite = this.runtime.objects.Sprite_Flower.createInstance("middleground", x, y);
		this.sprite = sprite;
		sprite.animationFrame = Utils.getRandInt(animationFrameMin, animationFrameMax);
		sprite.width = radius * 2;
		sprite.height *= (sprite.width / sprite.imageWidth);
		sprite.angle = Math.random() * Utils.TWO_PI;
		
		this.radius = radius;
		this.type = type;
		this.twinFlower = null;
		this.addAngle = addAngle;
		this.inclineAngle = inclineAngle;
		this.middleY = middleY;
		this.nectarOptions = nectarOptions;
		this.nectars = [];
		this.thirdIndex = null;
		
		this.vanishingFlowers = [];
		this.vanishingCount = 0;
		this.b_vanishingJump = false;
		
		this._spawn_nectar();
		
		this._create_vanishing_flower();
		
		this.collisionMask = null;
		this._create_collision_mask();
	}
	
	static init()
	{
		this.instances = [];
	}
	
	static tick()
	{
		const instances = this.instances;
		for (let i = 0; i < instances.length; i++)
		{
			const instance = instances[i];
			
			//instance._tick();
		}
	}
	
	static destroy_all()
	{
		this.instances.forEach(instance => {
			instance._destroy();
		});
		this.instances.length = 0;
	}
	
	tick()
	{
		this._set_vanishing_flower();
		
		this._check_vanishing_jump();
		
		this._set_collision_mask_position();
	}
	
	set_twin_flower(flower)
	{
		this.twinFlower = flower;
	}
	
	set_x(x)
	{
		const sprite = this.sprite;
		
		const nectars = this.nectars;
		for (let i = nectars.length - 1; i >= 0; i--)
		{
			const nectar = nectars[i];
			nectar.x += x - sprite.x;
		}
		
		const vanishingFlowers = this.vanishingFlowers;
		for (let i = vanishingFlowers.length - 1; i >= 0; i--)
		{
			const vanishingFlower = vanishingFlowers[i];
			vanishingFlower.x += x - vanishingFlower.x;
		}
		
		sprite.x = x;
	}
	
	_destroy()
	{
		this.sprite.destroy();
		
		this.vanishingFlowers.forEach(vanishingFlower => vanishingFlower.destroy());
		
		if (this.collisionMask !== null) this.collisionMask.destroy();
	}
	
	_spawn_nectar()
	{
		const flower = this.sprite;
		
		if (flower.animationFrame === 1) return;
		
		const nectarOptions = this.nectarOptions;
		const radius = nectarOptions.spawnRadius[flower.animationFrame];
		const [nectarMin, nectarMax] = nectarOptions.nectarMinAndMax;
		const size = nectarOptions.size;
		
		const len = Utils.getRandInt(nectarMin, nectarMax);
		const k = Utils.TWO_PI / len;
		const phase = Math.random() * Utils.TWO_PI;
		
		for (let i = 0; i < len; i++)
		{
			const angle = (i * k) + phase;
			const x = flower.x + (Math.cos(angle) * radius);
			const y = flower.y + (Math.sin(angle) * radius);
			
			const nectar = this.runtime.objects.Sprite_Nectar.createInstance("nectar", x, y);
			nectar.width *= size;
			nectar.height *= size;
			
			nectar.radius = nectar.width / 2;
			
			nectar.state = "";
			nectar.flower = this;
			this.nectars.push(nectar);
		}
	}
	
	_create_vanishing_flower()
	{
		if (true) return; //@task если есть модификатор на исчезающий.
		
		const sprite = this.sprite;
		sprite.setAnimation("vanishing");
		sprite.isVisible = false;
		
		for (let i = 0; i < 3; i++)
		{
			const vanishingFlower = this.runtime.objects.Sprite_Flower.createInstance("middleground", sprite.x, sprite.y);
			this.vanishingFlowers.push(vanishingFlower);
			vanishingFlower.setAnimation("vanishing");
			vanishingFlower.animationFrame = i;
			vanishingFlower.width = this.radius * 2;
			vanishingFlower.height *= (vanishingFlower.width / vanishingFlower.imageWidth);
		}
	}
	
	_set_vanishing_flower()
	{
		const speed = this.common.config["flower"]["vanishing speed"];
		
		const vanishingFlowers = this.vanishingFlowers;
		for (let i = vanishingFlowers.length - 1; i >= 0; i--)
		{
			const vanishingFlower = vanishingFlowers[i];
			if ((vanishingFlower.animation.frameCount - this.vanishingCount) <= i)
			{
				const [r, g, b] = vanishingFlower.colorRgb;
				const color = Utils.lerp_dt(g, 0, speed, this.runtime.dt);
				vanishingFlower.colorRgb = [1, color, color];
			}
		}
	}
	
	_check_vanishing_jump()
	{
		if (this.vanishingCount < 3) return;
		if (this.b_vanishingJump) return;
		
		this.b_vanishingJump = true;
		
		this.common.game.bee.set_state("jump");
	}
	
	_create_collision_mask()
	{
		if (!this.common.config["b_debug"]) return;
		
		const collisionMask = this.runtime.objects.Sprite_Collision_Mask.createInstance("bee", 0, 0);
		this.collisionMask = collisionMask;
		collisionMask.width = this.radius * 2;
		collisionMask.height = collisionMask.width;
		collisionMask.opacity = 0.75;
	}
	
	_set_collision_mask_position()
	{
		if (this.collisionMask === null) return;
		
		const collisionMask = this.collisionMask;
		const sprite = this.sprite;
		
		collisionMask.x = sprite.x;
		collisionMask.y = sprite.y;
	}
}

class Bee
{
	constructor(runtime, options, common)
	{
		Bee.instances.push(this);
		
		this.runtime = runtime;
		this.common = common;
		
		const {x, y, size, speed, smooth, wingsSpeed, wingsOffset} = options;
		
		this.speedLerp = speed;
		this.speed = this.speedLerp;
		this.smooth = smooth;
		this.x = x;
		this.y = y;
		this.flowerBeeAngle = 0;
		this.moveAngle = Math.PI * 1.5;
		this.state = "";
		this.flower = null;
		this.flowers = [];
		this.direction = 1;
		this.wings = [];
		this.wingsSpeed = wingsSpeed;
		this.wingsOffset = wingsOffset;
		
		this.hive = null;
		this.hiveRadius = null;
		
		this._create_sprite(x, y, size);
		this._create_wings(size);
		
		this.radius = (this.sprite.height / 2) * this.common.config["bee"]["collision radius"];
		
		this.collisionMask = null;
		this._create_collision_mask();
	}
	
	destroy()
	{
		this.sprite.destroy();
		this.wings.forEach(wing => wing.destroy());
		if (this.collisionMask !== null) this.collisionMask.destroy();
	}
	
	tick()
	{
		switch (this.state)
		{
			case "rotate": this._rotate(); break;
			case "jump": this._jump(); break;
			case "rotate infinity": this._rotate_infinity(); break;
			case "hive": this._rotate_hive(); break;
		}
		
		this._set_speed_lerp();
		
		this._set_sprite_position();
		this._set_wings_position();
		
		this._set_collision_mask_position();
	}
	
	set_state(state)
	{
		this.state = state;
		
		switch (state)
		{
			case "jump":
			{
				this.jumpX = this.x;
				this.jumpY = this.y;
				
				break;
			}
			
			case "hive":
			{
				this.flowerBeeAngle = this._get_angle_hive_bee(this.hive);
				
				break;
			}
			
			case "invisible":
			{
				this.sprite.isVisible = false;
				this.wings.forEach(wing => wing.isVisible = false);
				
				break;
			}
		}
	}
	
	set_flower(flower)
	{
		this.flower = flower;
		this.flowerBeeAngle = this._get_angle_flower_bee(flower);
		
		this.flowers.length = 0;
	}
	
	set_flowers(firstFlower, secondFlower)
	{
		this.flowers = [firstFlower, secondFlower];
		const angle = this._get_angle_flower_bee(firstFlower) - firstFlower.addAngle + (firstFlower.inclineAngle * -this.direction);
		this.flowerBeeAngle = angle < 0 ? angle + Utils.TWO_PI : angle;
		
		this.flower = null;
	}
	
	set_angle(angle)
	{
		this.moveAngle = angle;
	}
	
	reset_speed()
	{
		this.speedLerp = this.common.config["bee"]["speed"];
	}
	
	get _speedWithDT()
	{
		return this.speed * this.runtime.dt;
	}
	
	_get_angle_flower_bee(flower)
	{
		const flowerSprite = flower.sprite;
		return Utils.angleRadians(flowerSprite.x, flowerSprite.y, this.x, this.y) * this.direction;
	}
	
	_get_angle_hive_bee(hive)
	{
		return Utils.angleRadians(hive.x, hive.y, this.x, this.y) * this.direction;
	}
	
	_rotate()
	{
		const flower = this.flower;
		const flowerSprite = flower.sprite;
		const radius = flower.radius;
		const flowerBeeAngle = this.flowerBeeAngle;
		
		const angle = flowerBeeAngle * this.direction;
		this.x = flowerSprite.x + (Math.cos(angle) * radius);
		this.y = flowerSprite.y + (Math.sin(angle) * radius);
		
		switch (flowerSprite.animationName)
		{
			case "default": this._add_angle(radius); break;
			case "accelerating":
			{
				const oldPosition = this._get_cos_angle(this.flowerBeeAngle);
				this._add_angle(radius);
				const newPosition = this._get_cos_angle(this.flowerBeeAngle);
				
				if (this.direction === 1)
				{
					if ((oldPosition === 1) && (newPosition === -1))
					{
						this._add_speed();
					}
				}
				else
				{
					if ((oldPosition === -1) && (newPosition === 1))
					{
						this._add_speed();
					}
				}
				
				break;
			}
			
			case "vanishing":
			{
				const oldPosition = this._get_cos_angle(this.flowerBeeAngle);
				this._add_angle(radius);
				const newPosition = this._get_cos_angle(this.flowerBeeAngle);
				
				if (this.direction === 1)
				{
					if ((oldPosition === 1) && (newPosition === -1))
					{
						flower.vanishingCount++;
					}
				}
				else
				{
					if ((oldPosition === -1) && (newPosition === 1))
					{
						flower.vanishingCount++;
					}
				}
				
				break;
			}
		}
		
		this.moveAngle = Utils.angleRadians(flowerSprite.x, flowerSprite.y, this.x, this.y) + ((Math.PI / 2) * this.direction);
	}
	
	_add_angle(radius)
	{
		this.flowerBeeAngle += this._speedWithDT / radius;
	}
	
	_add_speed()
	{
		this.speedLerp *= this.common.config["bee"]["add speed"];
	}
	
	_get_cos_angle(angle)
	{
		return Math.round(Math.cos(Math.round(angle / Math.PI) * Math.PI));
	}
	
	_set_speed_lerp()
	{
		this.speed = Utils.lerp_dt(this.speed, this.speedLerp, 0.0001, this.runtime.dt);
	}
	
	_jump()
	{
		const speed = this._speedWithDT;
		const moveAngle = this.moveAngle;
		
		this.x += Math.cos(moveAngle) * speed;
		this.y += Math.sin(moveAngle) * speed;
	}
	
	_rotate_infinity()
	{
		const flowerBeeAngle = this.flowerBeeAngle;
		const numberFlower = Math.floor(flowerBeeAngle / Utils.TWO_PI) % 2;
		const flower = this.flowers[numberFlower];
		
		let infinityDirection;
		let addAngle;
		
		if (this.flowers[0].addAngle === 0)
		{
			addAngle = flower.addAngle;
			infinityDirection = addAngle === 0 ? 1 : -1;
		}
		else
		{
			addAngle = numberFlower === 0 ? Math.PI : 0;
			infinityDirection = numberFlower === 0 ? 1 : -1;
		}
		if (flower === undefined)
		{
			console.warn(this.flowers);
			debugger;
			return;
		}
		const flowerSprite = flower.sprite;
		const angle = ((flowerBeeAngle * this.direction) * infinityDirection) + addAngle + flower.inclineAngle;
		const radius = flower.radius;
		this.x = flowerSprite.x + (Math.cos(angle) * radius);
		this.y = flowerSprite.y + (Math.sin(angle) * radius);
		
		this.flowerBeeAngle += this._speedWithDT / radius;
		
		this.moveAngle = Utils.angleRadians(flowerSprite.x, flowerSprite.y, this.x, this.y) + (Math.PI / 2 * this.direction * infinityDirection);
	}
	
	_rotate_hive()
	{
		const hive = this.hive;
		const radius = this.hiveRadius;
		const flowerBeeAngle = this.flowerBeeAngle;
		
		const angle = flowerBeeAngle * this.direction;
		this.x = hive.x + (Math.cos(angle) * radius);
		this.y = hive.y + (Math.sin(angle) * radius);
		
		this.flowerBeeAngle += this._speedWithDT / radius;
		
		this.moveAngle = Utils.angleRadians(hive.x, hive.y, this.x, this.y) + ((Math.PI / 2) * this.direction);
		
		this.hiveRadius -= this.common.config["hive"]["bee speed"] * this.runtime.dt;
		
		if (this.hiveRadius <= 10)
		{
			const scale = 0.75;
			hive.width *= scale;
			hive.height *= scale;
			
			this.common.game.score += 50;
			
			this.set_state("invisible");
			
			setTimeout(() => this.common.hud.win(), 500); //просто визуальная задержка.
		}
	}
	
	_set_sprite_position()
	{
		const sprite = this.sprite;
		const smooth = this.smooth;
		
		if (smooth === 0)
		{
			sprite.x = this.x;
			sprite.y = this.y;
			sprite.angle = this.moveAngle;
			return;
		}
		
		const dt = this.runtime.dt;
		sprite.x = Utils.lerp_dt(sprite.x, this.x, smooth, dt);
		sprite.y = Utils.lerp_dt(sprite.y, this.y, smooth, dt);
		sprite.angleDegrees = this.runtime.callFunction("Angle_Lerp", sprite.angleDegrees, Utils.toDegrees(this.moveAngle), 1 - Math.pow(smooth, dt));
	}
	
	_set_wings_position()
	{
		const speed = this.wingsSpeed;
		const offset = this.wingsOffset;
		
		const sprite = this.sprite;
		const angle = sprite.angle;
		const angleDegrees = sprite.angleDegrees;
		
		const time = (Math.sin(this.runtime.gameTime * speed) + 1) / 2;
		
		const wings = this.wings;
		for (let i = 0; i < wings.length; i++)
		{
			const wing = wings[i];
			
			wing.x = (wing.startX * Math.cos(angle) - (wing.startY * Math.sin(angle))) + sprite.x;
			wing.y = ((wing.startX * Math.sin(angle)) + wing.startY * Math.cos(angle)) + sprite.y;
			
			const moveAngleDegrees = Utils.lerp(wing.startAngleDegrees, wing.startAngleDegrees + (offset * (wing.animationFrame === 0 ? -1 : 1)), time);
			wing.angleDegrees = moveAngleDegrees + angleDegrees;
		}
	}
	
	_create_sprite(x, y, size)
	{
		const sprite = this.runtime.objects.Sprite_Bee.createInstance("bee", x, y);
		this.sprite = sprite;
		sprite.width *= size;
		sprite.height *= size;
		sprite.angle = Math.PI * 1.5;
	}
	
	_create_wings(size)
	{
		const coords = [
			{x: -44, y: 32, a: 10},
			{x: -44, y: -32, a: 350}
		];

		coords.forEach((coord, index) => {
			const wing = this.runtime.objects.Sprite_Wing.createInstance("bee", coord.x * size, coord.y * size);
			wing.angleDegrees = coord.a;
			wing.startAngleDegrees = wing.angleDegrees;
			wing.animationFrame = index;
			wing.startX = wing.x;
			wing.startY = wing.y;
			wing.width *= size;
			wing.height *= size;
			this.wings.push(wing);
		});
	}
	
	_create_collision_mask()
	{
		if (!this.common.config["b_debug"]) return;
		
		const collisionMask = this.runtime.objects.Sprite_Collision_Mask.createInstance("bee", 0, 0);
		this.collisionMask = collisionMask;
		collisionMask.width = this.radius * 2;
		collisionMask.height = collisionMask.width;
		collisionMask.colorRgb = [1, 1, 0];
		collisionMask.opacity = 0.75;
	}
	
	_set_collision_mask_position()
	{
		if (this.collisionMask === null) return;
		
		const collisionMask = this.collisionMask;
		//const sprite = this.sprite;
		
		collisionMask.x = this.x;
		collisionMask.y = this.y;
	}
}

class Web
{
	constructor(runtime, options)
	{
		Web.instances.push(this);
		
		this.runtime = runtime;
		
		const {x, y, size, side, config} = options;
		
		this.side = side;
		this.nextFlower = null;
		this.paws = [];
		this.config = config;
		
		this._create_sprite(x, y, size);
		this._create_spider(x, y, size);
		
		this.radius = this.sprite.width / 2;
	}
	
	destroy()
	{
		this.sprite.destroy();
		this.spiderWebSprite.destroy();
		this.spiderBodySprite.destroy();
		this.spiderHeadSprite.destroy();
		this.paws.forEach(paw => paw.destroy());
	}
	
	tick()
	{
		this._set_paws_angle();
		this._set_head_angle();
	}
	
	set_x(x)
	{
		const offsetX = x - this.sprite.x;
		
		this.sprite.x = x;
		this.spiderWebSprite.x += offsetX;
		this.spiderBodySprite.x += offsetX;
		this.spiderHeadSprite.x += offsetX;
		this.paws.forEach(paw => paw.x += offsetX);
	}
	
	set_flower(flower)
	{
		this.nextFlower = flower;
	}
	
	_create_sprite(x, y, size)
	{
		const sprite = this.runtime.objects.Sprite_Spider.createInstance("middleground", x, y);
		this.sprite = sprite;
		sprite.setAnimation("web");
		sprite.width *= size;
		sprite.height *= size;
	}
	
	_create_spider(x, y, size)
	{
		const endY = y - (this.sprite.height / 2);
		
		const spiderWebSprite = this.runtime.objects.Sprite_Spider.createInstance("middleground", x, endY);
		this.spiderWebSprite = spiderWebSprite;
		spiderWebSprite.setAnimation("spider");
		spiderWebSprite.animationFrame = 0;
		spiderWebSprite.width *= size;
		spiderWebSprite.height *= size;
		
		this._create_paws(spiderWebSprite.x, spiderWebSprite.y, size);
		
		const spiderBodySprite = this.runtime.objects.Sprite_Spider.createInstance("middleground", x - (2 * size), endY - (100 * size));
		this.spiderBodySprite = spiderBodySprite;
		spiderBodySprite.setAnimation("spider");
		spiderBodySprite.animationFrame = 1;
		spiderBodySprite.width *= size;
		spiderBodySprite.height *= size;
		
		const spiderHeadSprite = this.runtime.objects.Sprite_Spider.createInstance("middleground", x, endY - (26 * size));
		this.spiderHeadSprite = spiderHeadSprite;
		spiderHeadSprite.setAnimation("spider");
		spiderHeadSprite.animationFrame = 2;
		spiderHeadSprite.width *= size;
		spiderHeadSprite.height *= size;
	}
	
	_create_paws(x, y, size)
	{
		const runtime = this.runtime;
		
		const pawsRightCoords = [
			{x: 60, y: -120, a: 356},
			{x: 80, y: -110, a: 358},
			{x: 96, y: -64, a: 0},
			{x: 54, y: -66, a: 2}
		];

		const pawsLeftCoords = [
			{x: -60, y: -120, a: 4},
			{x: -80, y: -110, a: 2},
			{x: -96, y: -64, a: 0},
			{x: -54, y: -66, a: 358}
		];

		function create_paws(coords, animation)
		{
			const paws = [];
			
			coords.forEach((pawCoord, index) => {
				const paw = runtime.objects.Sprite_Spider_Paw.createInstance("middleground", x + (pawCoord.x * size), y + (pawCoord.y * size));
				paw.angleDegrees = pawCoord.a;
				paw.startAngleDegrees = paw.angleDegrees;
				paw.setAnimation(animation);
				paw.animationFrame = (paw.animation.frameCount - 1) - index;
				paw.width *= size;
				paw.height *= size;
				paws.push(paw);
			});
			
			return paws;
		}
		
		this.paws.push(...create_paws(pawsRightCoords, "right"), ...create_paws(pawsLeftCoords, "left"));
	}
	
	_set_paws_angle()
	{
		const pawsConfig = this.config["web"]["paws"];
		const speed = pawsConfig["speed"];
		const offset = pawsConfig["offset"];
		
		const paws = this.paws;
		const sprite = this.sprite;
		const time = this.runtime.gameTime;
		
		const part = 360 / paws[0].animation.frameCount;
		paws.forEach((paw, index) => {
			const val = Math.sin((time * speed) + (index * part));
			paw.angleDegrees = paw.startAngleDegrees + (offset * val);
		});
	}
	
	_set_head_angle()
	{
		const headConfig = this.config["web"]["head"];
		const speed = headConfig["speed"];
		const offset = headConfig["offset"];
		
		const time = this.runtime.gameTime;
		this.spiderHeadSprite.angle = Math.sin(time * speed) * offset;
	}
}

class GameScore
{
	constructor(common, assets, config)
	{
		this.common = common;
		this.assets = assets;
		this.config = config;
		
		this.b_debug = false;
		this.projectId = 0;
		this.publicToken = "";
		this.gameScoreConfig = null;
		this.gs = null;
		this.skipCount = 0;
		this.b_SDKLoaded = false;
		
		globalThis.addEventListener("get score", async () => { //@debug.
			const player = this.gs.player;
			await player.ready;
			console.log('[game score]: score', player.score);
		});
		
		globalThis.addEventListener("products", async () => { //@debug.
			console.log(`[game score]: get products...`);
			const result = await this.gs.payments.fetchProducts();
			
			console.log('[game score]: products:', result["products"]);
			console.log('[game score]: player purchases:', result["playerPurchases"]);
			
			//gs.payments.on("error:fetchProducts", error => console.warn(`[game score] error fetchProducts`, error)); //@debug.
		});
		
		globalThis.addEventListener("purchase", async () => { //@debug.
			this.remove_ads();
		});
		
		globalThis.addEventListener("res", async () => { //@debug.
			console.log('res');
			
			this.add_score(-10);
			this.sync();
		});
	}
	
	async init()
	{
		await this._set_load_config();
		
		const checkProtection = this.common.check_protection(`use strict${this.projectId}${this.publicToken}${document.domain}`);
		if (checkProtection > 0)
		{
			console.log('Access denied.', checkProtection);
			this.common.b_accessDenied = true;
			return;
		}
		
		console.log('Load GameScore...');
		
		if (this.b_debug)
		{
			this._SDK_load_compete_debug();
			return;
		}
		
		const sdkAvailable = await this._SDK_load();
		if (!sdkAvailable)
		{
			this._SDK_not_available();
			return;
		}
		
		globalThis.onGSInit = async gs => {
			this.gs = gs;
			
			await gs.player.ready; //@bugfix #1.
			
			this._SDK_load_complete();
			
			if (!this.is_remove_ads_purchased())
			{
				if (gs.ads.isAdblockEnabled)
				{
					globalThis.dispatchEvent(new CustomEvent("adblock"));
					return;
				}
				
				await gs.ads.showPreloader();
				
				gs.ads.showSticky();
			}
			
			gs.ads.on("fullscreen:close", success => this._send_event_ads_close()); //@task. это тоже походу перенести в gui.
			
			console.log('gs.payments.isAvailable', this.is_payments_available());
		};
	}
	
	show_leaderboard()
	{
		if (this.b_debug) return;
		
		this.gs.leaderboard.open({"orderBy": ["score"], "withMe": "last"});
	}
	
	show_ads_fullscreen()
	{
		if (this._is_debug_and_send_ads_close()) return;
		
		/*if (this.is_rewarded_video_available()) //@task. эм, что? почему тут вообще этот код?
		{
			this._send_event_ads_close();
			return;
		}*/
		
		if (this._is_skip()) return;
		
		this._reset_skip();
		
		this.gs.ads.showFullscreen();
	}
	
	async show_rewarded_video()
	{
		if (this._is_debug_and_send_ads_close()) return false; //а тут надо отправлять о закрытии рекламы разве?
		
		if (this.is_remove_ads_purchased()) return true;
		
		this._reset_skip();
		
		return await this.gs.ads.showRewardedVideo();
	}
	
	is_rewarded_video_available()
	{
		if (this.b_debug) return false;
		
		return this.gs.ads.isRewardedAvailable;
	}
	
	add_score(score)
	{
		if (this.b_debug) return;
		
		this.gs.player.add("score", score);
		console.log('[game score]: add score', score);
	}
	
	sync()
	{
		if (this.b_debug)
		{
			globalThis.dispatchEvent(new CustomEvent("sync skip"));
			return;
		}
		
		this.gs.player.sync(); //await.
	}
	
	is_remove_ads_purchased()
	{
		if (this.b_debug) return true;
		
		return this.gs.payments.has(this.gameScoreConfig["remove ads id"]);
	}
	
	is_payments_available()
	{
		return this.gs.payments.isAvailable;
	}
	
	remove_ads()
	{
		if (this.b_debug) return;
		
		console.log('remove ads');
		
		this._purchase(this.gameScoreConfig["remove ads id"]);
	}
	
	check_remove_ads_and_close_sticky()
	{
		if (this.is_remove_ads_purchased()) this.gs.ads.closeSticky();
	}
	
	async _set_load_config() //@task. надо сделать чтобы этот метод вызывался только один раз. если у меня не загрузится SDK с первого раза, то этот метод вызовется ещё раз.
	{
		const gameScoreJson = await this.assets.fetchJson("game_score.json");
		this.gameScoreConfig = gameScoreJson
		this.b_debug = gameScoreJson["b_debug"];
		this.projectId = gameScoreJson["project id"];
		this.publicToken = gameScoreJson["public token"];
		console.log(`%c[GAME SCORE]: ${!this.b_debug}`, `background-color: ${!this.b_debug? '#00ff00': '#e004bf'};`);
	}
	
	_send_event_ads_close()
	{
		globalThis.dispatchEvent(new CustomEvent("ads close"));
	}
	
	_is_skip() //тут плохо, потому что is выполняет действие, а не должна.
	{
		this.skipCount++;
		
		if (this.skipCount >= this.config["ads"]["skip count"]) return false;
		
		this._send_event_ads_close();
		return true;
	}
	
	_is_debug_and_send_ads_close() //тут плохо, потому что is выполняет действие, а не должна.
	{
		if (this.b_debug)
		{
			this._send_event_ads_close();
			return true;
		}
		
		return false;
	}
	
	_reset_skip()
	{
		this.skipCount = 0;
	}
	
	async _SDK_load()
	{
		return await LoadScript(`https://gs.eponesh.com/sdk/game-score.js?projectId=${this.projectId}&publicToken=${this.publicToken}&callback=onGSInit`);
	}
	
	_SDK_load_complete()
	{
		console.log('GameScore load complete.');
		this.b_SDKLoaded = true;
	}
	
	_SDK_load_compete_debug()
	{
		console.log(`GameScore load complete. Debug mode.`);
		this.b_SDKLoaded = true;
	}
	
	_SDK_not_available()
	{
		console.warn('SDK not available');
		globalThis.dispatchEvent(new CustomEvent("SDK not available"));
	}
	
	_purchase(id)
	{
		console.log(`[game score]: purchase...`);
		this.gs.payments.purchase({"id": id}); //await.
	}
}