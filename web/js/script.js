window.addEventListener("load", async () => {
	let authId = localStorage.getItem("authId");
	if(authId){
		let res = await fetch("/api/steam/check", {
			headers: {
				Session: authId
			}
		});
		if(!res.ok){
			localStorage.removeItem("authId");
		} else {
			document.body.classList.toggle("logged", true);
			listUserSounds("welcome");
			listUserSounds("leave");
		}
	}
	listSounds();
	registerAsyncSubmitEvents();

	let soundContextMenu = new ContextMenu(".soundContextMenu", [
		{
			name: "Add to welcome sounds", 
			fn: (target) => {
				fetch("/api/user/sounds/welcome/" + target.innerText, {
					method: "post",
					headers: {
						Session: localStorage.getItem("authId")
					}
				});
			}
		}, {
			name: "Remove from welcome sounds", 
			fn: (target) => {
				fetch("/api/user/sounds/welcome/" + target.innerText, {
					method: "delete",
					headers: {
						Session: localStorage.getItem("authId")
					}
				});
			}
		}, {
			name: "Add to leave sounds", 
			fn: (target) => {
				fetch("/api/user/sounds/leave/" + target.innerText, {
					method: "post",
					headers: {
						Session: localStorage.getItem("authId")
					}
				});
			}
		}, {
			name: "Remove from leave sounds", 
			fn: (target) => {
				fetch("/api/user/sounds/leave/" + target.innerText, {
					method: "delete",
					headers: {
						Session: localStorage.getItem("authId")
					}
				});
			}
		}
	]);
});

window.addEventListener("storage", (e) => {
	if(e.key == "authId"){
		if(e.newValue){
			document.body.classList.toggle("logged", true);
			document.getElementById("welcomeSounds").innerHTML = "";
			document.getElementById("leaveSounds").innerHTML = "";
			listUserSounds("welcome");
			listUserSounds("leave");
		} else {
			document.body.classList.toggle("logged", false);
		}
	}
});

function registerAsyncSubmitEvents(){
	for(let form of document.querySelectorAll("form[data-asyncSubmit]")){
		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			let form = event.target;
			let options = {
				method: form.method
			};
			if(form.method.toUpperCase() != "GET")
				options.body = new FormData(form);
			if(form.getAttribute("data-session") != null)
				options.headers = {Session: localStorage.getItem("authId")};
			let res = await fetch(form.action, options);
			console.log(res);
			let contentType = res.headers.get("content-type");
			if(!res.ok){
				alert(await res.text());
			} else if(contentType != null && contentType.indexOf("application/json") !== -1){
				eval(await res.text());
			}
		});
	}
}

function soundDragStart(event){
	event.dataTransfer.setData("sound", event.target.innerText);
}

function allowDrop(event){
	event.preventDefault();
}

function soundDragDrop(event, type){
	event.preventDefault();
	let sound = event.dataTransfer.getData("sound");
	addUserSound(sound, type);
}

async function listSounds(){
	try {
		let res = await fetch("/api/sounds");
		let sounds = await res.json();
		if(!(sounds instanceof Array))
			throw new TypeError("Received data aren't Array.");
		let soundsElement = document.getElementById("sounds");
		for(let sound of sounds){
			let btn = document.createElement("div");
			btn.className = "button";
			btn.draggable = true;
			btn.ondragstart = soundDragStart;
			btn.classList.add("soundContextMenu");
			btn.innerText = sound;
			btn.addEventListener("click", async () => {
				let res = await fetch("/api/sounds/" + encodeURIComponent(sound) + "/play", {
					method: "POST"
				});
				console.log(res);
			});
			soundsElement.appendChild(btn);
		}
	} catch(e){
		console.log(e);
	}
}

async function addUserSound(sound, type, sendToServer = true){
	if(sendToServer){
		let res = await fetch("/api/user/sounds/"+type+"/" + sound, {
			method: "post",
			headers: {
				Session: localStorage.getItem("authId")
			}
		});
		if(res.status != 201)
			return;
	}
	let element = document.getElementById(type+"Sounds");
	let span = document.createElement("span");
	span.className = "tag";
	span.innerText = sound;
	span.innerHTML += `<button type="button" onclick="removeUserSound(this, '`+type+`')">🗙</button>`;
	element.appendChild(span);
}

async function listUserSounds(type){
	try {
		let res = await fetch("/api/user/sounds/"+type+"/", {
			headers: {
				Session: localStorage.getItem("authId")
			}
		});
		let sounds = await res.json();
		for(let sound of sounds){
			addUserSound(sound, type, false);
		}
	} catch(e){
		console.log(e);
	}
}

function removeUserSound(button, type){
	let sound = button.previousSibling.textContent;
	fetch("/api/user/sounds/"+type+"/" + sound, {
		method: "delete",
		headers: {
			Session: localStorage.getItem("authId")
		}
	});
	button.parentElement.parentElement.removeChild(button.parentElement);
}
