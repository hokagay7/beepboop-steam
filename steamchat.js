const {VM} = require('vm2');
const https = require('https');

const selectors = {
	loading: ".main_throbberContainer-exit-active_24VO6",
	loggedUsername: ".personanameandstatus_playerName_1uxaf",
	groupList: ".ChatRoomList .ChatRoomListGroupItem",
	groupListItem: ".chatRoomName",
	groupListItemChatroomList: ".ChatRoomListGroupItemChatRooms",
	groupListItemOpenBtn: ".openGroupButton",
	groupListItemVoiceChannel: ".chatRoomVoiceChannel .chatRoomVoiceChannelName",
	groupChatTab: "div.chatDialogs div.chatWindow.MultiUserChat.namedGroup",
	voiceChannelUsers: ".ActiveVoiceChannel .VoiceChannelParticipants"
};

class SteamChat {
	/**
	 * @param {Page} page - Puppeteer page
	 */
	constructor(page, soundsBaseUrl, youtubeBaseUrl, soundsDbGw){
		this.page = page;
		this.soundsBaseUrl = soundsBaseUrl;
		this.youtubeBaseUrl = youtubeBaseUrl;
		this.soundsDbGw = soundsDbGw;
		this.groupName = null;
		this.joinedUsers = [];

		this.activityInterval = setInterval(() => {
			this.page.mouse.move(Math.random()*100, Math.random()*100+300);
		},60000);
	}

	getPage(){
		return this.page;
	}

	async init(){
		try {
			await this.page.waitForSelector(selectors.loading);
		} catch(e){
			console.log(e);
		}
		await this.initAudio();

		this.myName = await this.page.evaluate((selectors) => {
			document.hasFocus = function(){return false;};
			return document.querySelector(selectors.loggedUsername).innerText;
		}, selectors);

		await this.page.exposeFunction("handleMessage", (group, message) => {
			return this.handleMessage(group, message);
		});

		await this.page.exposeFunction("findChatRoom", (message) => {
			return this.findChatRoom(message);
		});

		await this.page.evaluate(() => {
			window.Notification = function(text, options){
				this.text = text;
				this.options = options;

				this.addEventListener = async function(type, handler){
					if(type == "click"){
						handler();
						handleMessage(this.text, this.options.body);
					}
				};
				this.close = function(){};
			};
			window.Notification.permission = "granted";
			window.Notification.requestPermission = function(e){e("granted")};

			// Voice settings
			g_FriendsUIApp.VoiceStore.SetUseEchoCancellation(false);
			g_FriendsUIApp.VoiceStore.SetUseAutoGainControl(false);
			g_FriendsUIApp.VoiceStore.SetUseNoiseCancellation(false);
		});
	}
	
	initAudio(){
		return this.page.evaluate(() => {
			window.audioContext = new AudioContext();
			window.mixedAudio = window.audioContext.createMediaStreamDestination();
			window.gainNode = window.audioContext.createGain();
			window.gainNode.gain.value = 0.3;
			window.gainNode.connect(window.mixedAudio);

			function addStream(stream){
				let audioSource = window.audioContext.createMediaStreamSource(stream);
				audioSource.connect(window.gainNode);
			}
			window.addStream = addStream;

			navigator.getUserMedia = function(options, success){
				success(window.mixedAudio.stream);
			};
			
			window.audio = new Audio();
			window.audio.controls = true;
			window.audio.muted = true;
			window.audio.crossOrigin = "annonymous";
			window.audio.oncanplay = ()=>{
				window.addStream(window.audio.captureStream());
				window.audio.play();
			};

			window.say = function(text){
				let utter = new SpeechSynthesisUtterance(text);
				utter.voice = window.speechSynthesis.getVoices();
				utter.rate = 1.3;
				utter.pitch = 0.3;
				window.speechSynthesis.speak(utter);
			}
		});
	}

	async handleMessage(groupName, message){
		console.log("handlemessage", groupName, message);
		const unknownMessages = [
			"the fuck you want?",
			"I'm not fluent in meatbag language",
			"fuck you too"
		];
		const errorMessages = [
			"nope",
			"418 I'm a teapot",
			"E̴͚̠̰̺͎̘ͫR̮͈͓̆͜R͕̩̩̭̙͘Ȯ͖̜̱̞̜ͮR̉",
			"/me is currently unavailable"
		];
		// g_FriendsUIApp.ChatStore.m_mapChatGroups.get("21961").m_mapRooms.get("84836").SendChatMessage("beep?","beep?","beep?","beep?")
		message = /.*: "(.*)"/.exec(message)[1];
		let response = null;
		if(message.startsWith("@" + this.myName + " ")){
			message = message.substring(this.myName.length + 2);
			let index = message.indexOf(" ");
			if(index < 0)
				index = message.length;
			let command = message.substr(0, index).trim();
			let arg = message.substr(index + 1);
			try {
				switch(command.toLowerCase()){
					case "play":
						await this.playSound(arg);
						break;
					case "playurl":
						await this.playSoundUrl(arg);
						break;
					case "instant":
						await this.playInstant(arg);
						break;
					case "stop":
						await this.stopSound();
						break;
					case "beep":
					case "beep?":
						response = "boop";
						break;
					case "eval":
						const vm = new VM({
							wrapper: "none"
						});
						let result = vm.run(arg);
						response = "/code " + JSON.stringify(result);
						break;
					default:
						response = unknownMessages[Math.round(Math.random()*(unknownMessages.length - 1))];
						break;
				}
			} catch(e){
				console.log("command error", e.message);
				response = errorMessages[Math.round(Math.random()*(errorMessages.length - 1))] + "\n" + e.message;
			}
		}
		console.log("response", response);
		if(response !== null){
			await this.page.type("textarea", response);
			await this.page.click("textarea + button");
		}
	}

	async sendMessage(groupName, message){
		let chat = await this.findChatRoom(groupName);
		await this.page.evaluate((chat, message) => {
			g_FriendsUIApp.ChatStore.FindChatRoom(chat.groupId, chat.roomId).SendChatMessage(message);
		}, chat, message);
	}

	findChatRoom(groupName){
		return this.page.evaluate((groupName) => {
			let groupId = null;
			let group = null;
			for(g of g_FriendsUIApp.ChatStore.m_mapChatGroups){
				if(g[1].name == groupName){
					groupId = g[0];
					group = g[1];
					break;
				}
			}
			if(group == null)
				return null;

			let lastMention = 0;
			let roomId = null;
			let room = null;
			for(let r of group.m_mapRooms){
				if(r[1].m_rtLastMention > lastMention){
					lastMention = r[1].m_rtLastMention;
					roomId = r[0];
					room = r[1];
				}
			}
			return {
				groupId, roomId
			}
		}, groupName);
	}

	getGroups(){
		return this.page.evaluate((selectors) => {
			let groupNames = document.querySelectorAll(selectors.groupList + " " + selectors.groupListItem);
			return Array.prototype.map.call(groupNames, (e) => {return e.innerText;});
		}, selectors);
	}

	getVoiceChannels(group){
		return this.page.evaluate((group, selectors) => {
			for(let g of document.querySelectorAll(selectors.groupList)){
				if(g.querySelector(selectors.groupListItem).innerText == group){
					let voiceRooms = g.querySelector(selectors.groupListItemChatroomList).firstChild;
					if(voiceRooms.children.length == 0)
						g.querySelector(selectors.groupListItemOpenBtn).click();
					let channelNames = g.querySelectorAll(selectors.groupListItemVoiceChannel);
					return Array.prototype.map.call(channelNames, (e) => {return e.innerText;});
				}
			}
			return [];
		}, group, selectors);
	}

	async openGroup(group){
		let groupId = await this.getGroupIdByName(group);
		await this.page.evaluate((groupId) => {
			let group = g_FriendsUIApp.ChatStore.GetChatRoomGroup(groupId);
			g_FriendsUIApp.UIStore.ShowAndOrActivateChatRoomGroup(group.chatRoomList[0], group, true);
		}, groupId);
		try {
			await this.page.waitForSelector(selectors.groupChatTab);
		} catch(e){
			console.log(e);
		}
	}

	async getGroupIdByName(name){
		return await this.page.evaluate((name) => {
			for(var g of g_FriendsUIApp.ChatStore.m_mapChatGroups.values()){
				if(g.name == name){
					return g.GetGroupID();
				}
			}
			return null;
		}, name);
	}

	async getGroupMembers(groupId){
		// Group has to be opened for this to work!
		return await this.page.evaluate((groupId) => {
			let members = [];
			for(let bucket of g_FriendsUIApp.GroupMemberStore.GetGroupMemberList(groupId)){
				for(let f of bucket.m_rgMembers)
					members.push({
						name: f.display_name,
						steamid64: f.steamid64
					});
			}
			return members;
		}, groupId.toString());
	}

	async getVoiceChannelUsers(){
		return await this.page.evaluate(() => {
			let users = [];
			let voiceChat = g_FriendsUIApp.ChatStore.GetActiveVoiceChat();
			for(let m of voiceChat.m_groupVoiceActiveMembers.GetRawMemberList)
				users.push(m.persona.m_steamid.m_ulSteamID.toString());
			return users;
		});
	}

	async voiceChannelUsersChanged(){
		let users = await this.getVoiceChannelUsers();
		for(let user of this.joinedUsers){
			if(users.indexOf(user) >= 0)
				continue;
			else {
				console.log("user left:", user);
				let sound = await this.soundsDbGw.selectRandomUserSound(user, this.soundsDbGw.SoundType.LEAVE);
				if(sound != null)
					this.playSound(sound);
				else
					console.log("No sound.");
			}
		}
		for(let user of users){
			if(this.joinedUsers.indexOf(user) >= 0)
				continue;
			else {
				console.log("user joined:", user);
				let sound = await this.soundsDbGw.selectRandomUserSound(user, this.soundsDbGw.SoundType.WELCOME);
				if(sound != null)
					this.playSound(sound);
				else
					console.log("No sound.");
			}
		}
		this.joinedUsers = users;
	}
	
	async joinVoiceChannel(group, channel){
		this.groupName = group;
		this.openGroup(group);
		await this.page.exposeFunction("joinedUsersChanged", async () => {
			this.voiceChannelUsersChanged();
		});
		let groupId = await this.getGroupIdByName(group);
		await this.page.evaluate((groupId, channelName) => {
			let group = g_FriendsUIApp.ChatStore.GetChatRoomGroup(groupId);
			for(let voiceChannel of group.voiceRoomList){
				if(voiceChannel.name == channelName){
					voiceChannel.StartVoiceChat();
					break;
				}
			}
		}, groupId, channel);
		await this.page.waitForSelector(selectors.voiceChannelUsers);
		await this.page.evaluate((selectors) => {
			// Join observer
			setTimeout(() => {
				let usersList = document.querySelector(selectors.voiceChannelUsers).firstElementChild;
				window.mutationObserver = new MutationObserver((mutRecords) => {
					window.joinedUsersChanged();
				});
				window.mutationObserver.observe(usersList, {childList: true});
			}, 1000);
		}, selectors);
	}

	playSound(soundName){
		this.playSoundUrl(this.soundsBaseUrl + soundName);
	}
	
	playSoundUrl(url){
		const ytRegEx = /^(https?:)?(\/\/)?(www.)?(youtube.com|youtu.be)\//;
		console.log("playUrl", url);
		if(ytRegEx.test(url)){
			console.log("youtube detected");
			url = this.youtubeBaseUrl + encodeURIComponent(url);
		}
		return this.page.evaluate((url) => {
			window.audio.src = url;
			return true;
		}, url);
	}

	stopSound(){
		return this.page.evaluate(() => {
			window.audio.pause();
			return true;
		});
	}

	playInstant(search){
		return new Promise((resolve, reject) => {
			const instantRegEx = /^(.*?)(#(\d))?$/;
			let reRes = instantRegEx.exec(search);
			search = reRes[1];
			let number = reRes[3] || 1;
			let url = "https://www.myinstants.com/search/?name=" + encodeURIComponent(search);
			console.log("instant search url", url);
			https.get(url, (resp) => {
				let data = "";

				resp.on('data', (chunk) => {
					data += chunk;
				});

				resp.on('end', () => {
					let search_regex = /<div class="small-button" onmousedown="play\('([\w\.\/\-_%]*)'\)/g;
					let regex_result;
					for(let i = 0; i < number; i++){
						regex_result = search_regex.exec(data);
					}
					if(regex_result == null)
						return reject(new Error("No instant found."));
					this.playSoundUrl("https://www.myinstants.com" + regex_result[1]);
					resolve();
				});
			}).on("error", (err) => {
				console.log("Error: " + err.message);
				reject(err);
			});
		});
	}
}

module.exports = SteamChat;