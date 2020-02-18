// ==UserScript==
// @name        Duolingo Next Lesson
// @namespace   local
// @include     https://www.duolingo.com/*
// @author      Camilo Arboleda
// @version     1.2.2
// @description Add a "START LESSON" button in Duolingo. Check the README for more magic
// @grant       GM_getValue
// @grant       GM_setValue
// @downloadURL https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// @updateURL   https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// ==/UserScript==

// UI Constants
let K_SIDE_PANEL = "_21w25 _1E3L7";
let K_DUOTREE = "i12-l";
let K_SKILL_ITEM = "QmbDT";
let K_SMALL_SCREEN_BUTTON = "oNqWF _3hso2 _2Zh2S _1X3l0 _1AM95 H7AnT";
let K_SECTION = "Xpzj7 _3HLko";
let K_SUBSECTION = "CDRFO";
let K_ROW = "_2GJb6";
let K_CRACKED = "_22Nf9";
let K_SHORT_NAME = "_378Tf";
let K_EXERCISE_BUTTON = "_3bahF _3J-7b";
let K_SKILL_POPUP = "Af4up QmbDT";
let K_LEVEL_DIV = "I1Bp8";
let K_LESSONS_DIV = "_2yvEQ";

// Read configuration first
// Kind of weird to read config before defining constants, but it was
// the easiest way I found to keep the constants configurable and constant :-)
var duoState = {};
var course_skills = [];
var skills = [];
var current_course = {};
var tree = [];
var course_keys = [];

// max_slope/min_slope: Maximum and minimum difference in crowns between
//		the first active skill and the last skill in the course
//		Higher slope means you have to repeat earlier lessons first.
//		Lower slope means you can advance the course faster.
// max_level: level you want to reach in all skills
// sequential: Complete the tree left to right
//
// duo.nextleson
// "{\"min_slope\":2,\"max_slope\":6,\"max_level\":4.8,\"sequential\":true}"


Array.prototype.randomElement = function () {
    return this[Math.floor(Math.random() * this.length)]
}

Element.prototype.parentN = function(n) {
	if (parseInt(n) <= 0) {
		return this;
	}
	return this.parentElement.parentN(n - 1);
}

function isCurrentCourse(x)
{
	return x.learningLanguage === duoState.user.learningLanguage &&
		x.fromLanguage === duoState.user.fromLanguage;
}

function readDuoState() {
	duoState = JSON.parse(localStorage['duo.state']);
	course_skills = Object.values(duoState.skills).filter(isCurrentCourse);
	skills = course_skills.filter(skill => skill.accessible == true &&
			skill.hasOwnProperty('bonus') == false);
	current_course = Object.values(duoState.courses).filter(isCurrentCourse)[0];
	tree = current_course.skills.map(row => row.map (skill => {
		duoState.skills[skill].targetCrownLevel = 1;
		return duoState.skills[skill];
	}))
	totalLessons = course_skills.map(x => x.lessons).reduce((a, b) => a + b, 0);
	course_keys = Object.keys(current_course.trackingProperties);
	// console.debug("[DuolingoNextLesson] Read the configuration!");
}

function readConfig() {
	let local_config_name = 'duo.nextlesson.' + duoState.user.learningLanguage +
	'.' + duoState.user.fromLanguage;
	let default_values = { min_slope: 4, max_slope: 8, max_level: 5, sequential: true };
	default_config = JSON.parse(GM_getValue("duo.nextlesson", JSON.stringify(default_values)));
	var local_config = JSON.parse(GM_getValue(local_config_name,JSON.stringify(default_config)));
	// console.debug(local_config)
	return local_config;
}

function applyStep(skill, index) {
	// 1 ≤ currentProgress ≤ TargetCrownLevel ≤ max_level
	skill.targetCrownLevel = Math.max(
			Math.min(this.max_level - this.step * (index - this.offset),
			this.max_level), skill.currentProgress);

	skill.crownWeight = skill.targetCrownLevel - skill.currentProgress;
	// console.debug("[DuolingoNextLesson] S:" + skill.shortName + " " + index + " T:" + skill.targetCrownLevel + " W:" + skill.crownWeight);
	return skill;
}

function updateCrownLevel(local_config) {
	// Read configuration
	let max_slope = parseFloat(local_config.max_slope);
	let min_slope = parseFloat(local_config.min_slope);
	let sequential_tree = local_config.sequential;
	let max_level = parseFloat(local_config.max_level);

	// Give all skills an index.
	// Makes it easy to find the array possition for any given skill
	// Calculate progress for all skills
	skills.map((skill, index) => { skill.index = index;
		return skill.currentProgress = skill.finishedLevels +
		1 - skill.progressRemaining.reduce( (acc,val) => acc = acc + val, 0 ) });

	let active_skills = skills.filter(skill => skill.currentProgress < max_level);
	if (active_skills.length == 0)
	{
		// console.debug("[DuolingoNextLesson: Finished tree")
		return skills.randomElement()
	}
	let last_skill = skills[skills.length - 1];
	let last_row = skills.filter(skill => skill.row == last_skill.row && skill.finishedLevels == 0);
	let first_skill = active_skills.length > 0 ? active_skills[0]: skills[0];
	let offset = first_skill.index;

	let max_diff = max_level - last_skill.currentProgress;

	let slope = Math.max(
		Math.min(max_diff * course_skills.length / (skills.length - offset),
		max_slope), min_slope);

	let step = slope / course_skills.length;

	let targetCrownLevel = Math.min(
		max_level, Math.max(skills.length * step + last_skill.currentProgress + 0.1,
			first_skill.currentProgress + 0.1));

	// console.debug("[DuolingoNextLesson] Offset: "+ offset+ "   Target: " + targetCrownLevel + "   Slope:" + slope + "  Step:" + step);
	skills.map(applyStep, {offset: offset, max_level: targetCrownLevel, step: step});

	// Complete skills in unlocked rows sequentially
	if ( sequential_tree && last_row.length > 1) {
		for (let index = 1; index < last_row.length; index++) {
			last_row[index].crownWeight = 0;
		}
	}

	var max_weight = skills.reduce( (acc,skill) => acc = Math.max(acc, skill.crownWeight), 0);
	// console.debug("[DuolingoNextLesson] Max weight: " + max_weight);
	// console.debug(skills.filter(skill => skill.crownWeight >= (max_weight - 0.1)));
	var next_skill = skills.filter(skill => skill.crownWeight > 0 && skill.crownWeight >= (max_weight - 0.1)).randomElement();
	// console.debug("[DuolingoNextLesson] Next skill: " + next_skill.shortName);
	// console.debug(skills);
	return next_skill;
}

// This dead code is here an not at the bottom of the file so I can easily
// copy-paste the important parts of the script into firefox.
// var local_config = {min_slope: 2, max_slope: 6, max_level: 4.8, sequential: true};
// var local_config = readDuoState(); updateCrownLevel(local_config);
// skills.map(x => res = {w: x.crownWeight, n: x.shortName})
// skills.map(x => res = {w: x.crownWeight, t: x.targetCrownLevel, c: x.currentProgress, n: x.shortName })
// skills.filter( (skill, i, a) => i > 0 ? skill.row != a[i - 1].row : true ).map(skill => skill.targetCrownLevel)

function createLessonButton(skill) {
	var exercise_button = document.getElementsByClassName(K_EXERCISE_BUTTON)[0];

	// Mark the first elemnt in the tree.
	// It might be incompatible with other scripts using a similar trick
	document.getElementsByClassName(K_SKILL_ITEM)[0].id="skill-tree-first-item";

	var button = document.getElementById("next-lesson-button");
	if (button == null) {
		button = document.createElement("button");
	} else {
		exercise_button.removeChild(button);
		button = document.createElement("button");
	}
	// Configure the next lesson button
	button.id = "next-lesson-button";
	button.type = "button";
	button.textContent = "Start " + skill.shortName;
	button.onclick = function () {
		window.location.href = skillURL(skill);
	};
	// console.debug("[DuolingoNextLesson] No side panel");
	button.className = K_SMALL_SCREEN_BUTTON
		+ " reverse-tree-enhancer-button";
	button.style = "visibility: visible;" +
		"border-left-width: 1px; ";
	exercise_button.appendChild(button);
}

function selectNextLesson(skill) {
	var skill_names = Array.prototype.slice.call(document.getElementsByClassName(K_SHORT_NAME));
	var next_skill = skill_names.filter(name => name.innerText == skill.shortName)[0].parentN(3);
	return next_skill;
}

function clickNextLesson(next_skill)
{
	if (GM_getValue("auto_scroll_to_next", true)) {
		next_skill.scrollIntoView(false);
		next_skill.firstChild.firstChild.click();
	}

}

function skillURL(skill) {
	var URL = "/skill/" +
		skill.learningLanguage + "/" +
		skill.urlName + "/"
	if (skill.finishedLevels < 5) {
		URL = URL +	(1+skill.finishedLessons);
	} else {
		URL = URL + "practice"
	}
	return URL;
}

/* Move all craked skills to a new section at the begining of the tree */
function toDoNextSkills(next_skill, move_cracked_skills) {
	var cracked = Array.prototype.slice.call(document.getElementsByClassName(K_CRACKED))
	var cracked_skills = cracked.map(item => item.parentN(6));
	cracked_skills.unshift(next_skill); // Include also next_skill
	var c_size = 4;
	var cracked_chunks = Array(Math.ceil(cracked_skills.length / c_size)).fill().map((_, i) => cracked_skills.slice(i * c_size, i * c_size + c_size));
	var section = document.createElement("div")
	var subsection = document.createElement("div")
	var firstsect = document.getElementsByClassName(K_SECTION)[0];
	section.className = K_SECTION;
	subsection.className = K_SUBSECTION;
	firstsect.parentElement.insertBefore(section, firstsect);
	var rows = cracked_chunks.map(chunk => {
		var row = document.createElement("div");
		row.className = K_ROW;
		if (move_cracked_skills) {
			// Remove elements from the tree
			chunk.forEach(item => row.appendChild(item));
		} else {
			// Clone elements at the beginning of the tree
			chunk.forEach(item => {
				var cloned = item.cloneNode(true);
				var my_keys = Object.keys(item.firstChild.firstChild);
				my_keys.forEach(key => cloned.firstChild.firstChild[key] = item.firstChild.firstChild[key]);
				row.appendChild(cloned);
			});
		}
		return row;
	})
	section.appendChild(subsection)
	rows.map(row => subsection.appendChild(row));
}

function onChangeNextLesson(mutationsList) {
	var duotree = document.getElementsByClassName(K_DUOTREE);

	/* Add a "NEXT LESSON" button when necessary */
	if (duotree.length != 0) {
		if (document.getElementById("skill-tree-first-item") == null) {
			// console.debug("[DuolingoNextLesson] You need a new button");
			readDuoState();
			var local_config = readConfig();
			var next_skill = updateCrownLevel(local_config);
			createLessonButton(next_skill);
			var selected_skill = selectNextLesson(next_skill);
			toDoNextSkills(selected_skill, GM_getValue('move_cracked_skills', true));
			clickNextLesson(selected_skill);
		}
	}

	/* List the number of lessons missing in the current level */
	for (var i = 0; i < mutationsList.length; ++i) {
		mutation = mutationsList[i];
		if (mutation.type === 'childList') {
			var target = mutation.target;
			// console.debug(target.className);
			if (target.className == K_SKILL_POPUP) {
				// console.debug("New pop-up");
				var level = target.getElementsByClassName(K_LEVEL_DIV)[0];
				if (level != null) {
					var skill_node = level.parentN(4);
					// console.debug(skill_node);
					var skill_shortName = skill_node.getElementsByClassName(K_SHORT_NAME)[0].innerText;
					// console.debug("Node " + skill_shortName);
					var selected_skill = skills.filter(skill => skill.shortName == skill_shortName)[0];
					var div = document.createElement('div');
					div.className = K_LESSONS_DIV;
					div.innerHTML = "Lessons " + selected_skill.finishedLessons + '/' + selected_skill.lessons;
					level.insertBefore(div, level.firstChild.nextSibling);
				}
			}
		}
	}

}

new MutationObserver(onChangeNextLesson).observe(document.body, {
	childList: true,
	subtree: true
});

console.debug("DuolingoNextLesson version " + GM_info.script.version
	+ " ready");
