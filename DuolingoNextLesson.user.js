// ==UserScript==
// @name        Duolingo Next Lesson
// @namespace   local
// @include     https://www.duolingo.com/*
// @author      Camilo
// @version     1.1.3
// @description Add a "START LESSON" button in Duolingo.
// @grant	none
// @downloadURL https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// @updateURL   https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// ==/UserScript==

// UI Constants
let K_SIDE_PANEL = "_21w25 _1E3L7";
let K_GLOBAL_PRACTICE = "_6Hq2p _2ESN4 _1X3l0 _1AM95 mucpb";
let K_DUOTREE = "i12-l";
let K_SKILL_ITEM = "w8Lxd";
let K_SMALL_SCREEN_BUTTON = "oNqWF _3hso2 _1X3l0 _1AM95  H7AnT";

// Read configuration first
// Kind of weird to read config before defining constants, but it was
// the easiest way I found to keep the constants configurable and constant :-)
var duoState = {};
var course_skills = [];
var skills = [];
var current_course = {};
var tree = [];
var course_keys = [];
var next_skill = {};
var local_config = {};

// max_slope/min_slope: Maximum and minimum difference in crowns between
//		the first active skill and the last skill in the course
//		Higher slope means you have to repeat earlier lessons first.
//		Lower slope means you can advance the course faster.
// max_level: level you want to reach in all skills
// sequential: Complete the tree left to right
//
// var local_config = {min_slope: 2, max_slope: 8, max_level: 5, sequential: true};
// localStorage.setItem('duo.nextlesson.es.en', JSON.stringify(local_config))
// localStorage.removeItem('duo.nextlesson.eo.es');  // target.from


Array.prototype.randomElement = function () {
    return this[Math.floor(Math.random() * this.length)]
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
	local_config = JSON.parse(localStorage.getItem(local_config_name));
	if (local_config == null) {
		local_config = {};
	}
	// console.debug(local_config)
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

function updateCrownLevel() {
	// Read configuration
	let max_slope = local_config.hasOwnProperty('max_slope') ? local_config.max_slope: 4;
	let min_slope = local_config.hasOwnProperty('min_slope') ? local_config.min_slope: max_slope / 2;
	let sequential_tree = local_config.hasOwnProperty('sequential') ? local_config.sequential:true;
	var max_level = local_config.hasOwnProperty('max_level') ? local_config.max_level: 5;

	// Give all skills an index.
	// Makes it easy to find the array possition for any given skill
	// Calculate progress for all skills
	skills.map((skill, index) => { skill.index = index;
		return skill.currentProgress = skill.finishedLevels +
		1 - skill.progressRemaining.reduce( (acc,val) => acc = acc + val, 0 ) });

	let active_skills = skills.filter(skill => skill.finishedLevels < max_level);
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
	next_skill = skills.filter(skill => skill.crownWeight >= (max_weight - 0.1)).randomElement();
	// console.debug("[DuolingoNextLesson] Next skill: " + next_skill.shortName);
	// console.debug(skills);
}

// This dead code is here an not at the bottom of the file so I can easily
// copy-paste the important parts of the script into firefox.
// var local_config = {min_slope: 2, max_slope: 4, max_level: 4, sequential: true};
// readDuoState(); updateCrownLevel();
// skills.map(x => res = {w: x.crownWeight, n: x.shortName})
// skills.map(x => res = {w: x.crownWeight, t: x.targetCrownLevel, c: x.currentProgress, n: x.shortName })
// skills.filter( (skill, i, a) => i > 0 ? skill.row != a[i - 1].row : true ).map(skill => skill.targetCrownLevel)

function createLessonButton(skill) {
	var sidepanel = document.getElementsByClassName(K_SIDE_PANEL);
	var duotree = document.getElementsByClassName(K_DUOTREE)[0];

	// Mark the first elemnt in the tree.
	// It might be incompatible with other scripts using a similar trick
	document.getElementsByClassName(K_SKILL_ITEM)[0].id="skill-tree-first-item";

	var button = document.getElementById("next-lesson-button");
	if (document.getElementById("next-lesson-button") == null) {
		button = document.createElement("button");
	}

	button.id = "next-lesson-button";
	button.type = "button";
	button.textContent = "Start " + skill.shortName;
	button.onclick = function () {
		window.location.href= skillURL(skill);};
	if (sidepanel.length > 0) {
		// console.debug("[DuolingoNextLesson] Side panel");
		button.className = K_GLOBAL_PRACTICE;
	    button.style = "margin-top: 10px;"
	    	+ "display: block;"
	        + "visibility: visible;";
		sidepanel[0].appendChild(button);
	} else {
		// console.debug("[DuolingoNextLesson] No side panel");
		button.className = K_SMALL_SCREEN_BUTTON
			+ " reverse-tree-enhancer-button";
		button.style = "visibility: visible;";
		duotree.insertBefore(button, duotree.firstChild);
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

/* Add a "NEXT LESSON" button when necessary */
function onChangeNextLesson(mutationsList) {
	var duotree = document.getElementsByClassName(K_DUOTREE);
	if (document.getElementById("skill-tree-first-item") == null
			&& duotree.length != 0) {
		// console.debug("[DuolingoNextLesson] You need a new button");
		readDuoState();
		readConfig();
		updateCrownLevel();
		createLessonButton(next_skill);
	}
}

readDuoState();
if (course_keys.includes("total_crowns")) {
	new MutationObserver(onChangeNextLesson).observe(document.body, {
	    childList : true,
	    subtree : true
	});

    console.debug("DuolingoNextLesson version " + GM_info.script.version
            + " ready");
	onChangeNextLesson();
} else {
	console.debug("[DuolingoNextLesson] No crowns for you yet");
}
