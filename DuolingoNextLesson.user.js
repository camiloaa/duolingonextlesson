// ==UserScript==
// @name        Duolingo Next Lesson
// @namespace   local
// @include     https://www.duolingo.com/*
// @include     https://preview.duolingo.com/*
// @author      Camilo Arboleda
// @version     1.3.1
// @description Add a "START LESSON" button in Duolingo. Check the README for more magic
// @copyright   2018+ Camilo Arboleda
// @license     https://github.com/camiloaa/duolingonextlesson/raw/master/LICENSE
// @grant       GM_getValue
// @grant       GM_setValue
// @downloadURL https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// @updateURL   https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// ==/UserScript==

// UI Constants
let K_DUO_TREE_DATA_TEST = "skill-tree";
let K_SKILL_DATA_TEST = "skill";
let K_PRACTICE_BUTTON_DATA_TEST = "global-practice";
let K_TREE_SECTION_DATA_TEST = "tree-section";
// Some elements remain hard-coded for compatibility reasons
let K_SHORT_NAME = "Mr3if _2OhdT _1V15X _3PSt5";
let K_BUTTON_CLASS = "_2Jb7i _3iVqs _2A7uO _2gwtT _1nlVc _2fOC9 t5wFJ _3dtSu _25Cnc _3yAjN _3Ev3S _1figt";

let K_PLUGIN_NAME = "DuolingoNextLesson";
let K_FIRST_SKILL_ITEM_ID = "skill-tree-first-item";
let K_NEXT_LESSON_BUTTON_ID = "next-lesson-button";

// Default setup
let K_MOVE_CRACKED_SKILLS = false;
let K_AUTO_SCROLL_TO_NEXT = false;
let K_CREATE_EXERCISE_BUTTON = true;
// Read configuration first
// Kind of weird to read config before defining constants, but it was
// the easiest way I found to keep the constants configurable and constant :-)
var duoState = {};
var course_skills = [];
var skills = [];
var current_course = {};
var tree = [];
var course_keys = [];

// Restore console
var i = document.createElement('iframe');
i.style.display = 'none';
document.body.appendChild(i);
myconsole = i.contentWindow.console;

function log(objectToLog) {
	myconsole.debug("[" + K_PLUGIN_NAME + "]: %o", objectToLog);
}

// max_slope/min_slope: Maximum and minimum number of segments the course
//		should be split into. One segment is split at a time.
//		Higher slope means you have to repeat earlier lessons first.
//		Lower slope means you can advance the course faster.
// max_level: level you want to reach in all skills
// sequential: Complete the tree left to right
//
// duo.nextlesson
// "{\"min_slope\":2,\"max_slope\":6,\"max_level\":4.8,\"sequential\":true}"

// --------------------------------------
// UI-elements Section
// --------------------------------------

Array.prototype.randomElement = function () {
	return this[Math.floor(Math.random() * this.length)]
}

Element.prototype.parentN = function (n) {
	if (parseInt(n) <= 0) {
		return this;
	}
	return this.parentElement.parentN(n - 1);
}

function getFirstElementByDataTestValue(data_test) {
	return document.querySelector("*[data-test='" + data_test + "']");
}

function getDuoTree() {
	// <div data-test="skill-tree" class="nae5G">
	return getFirstElementByDataTestValue(K_DUO_TREE_DATA_TEST);
}

function getFirstSkill() {
	// <div class="_2iiJH _1DMov" data-test="skill">
	return getFirstElementByDataTestValue(K_SKILL_DATA_TEST);
}

function getPracticeAnchor() {
	// <a data-test="global-practice" ... >
	return getFirstElementByDataTestValue(K_PRACTICE_BUTTON_DATA_TEST);
}

function getTreeSection() {
	// <div class="f1yMM _24RGH" data-test="tree-section">
	return getFirstElementByDataTestValue(K_TREE_SECTION_DATA_TEST);
}

function getTreeSubsectionClass() {
	return getTreeSection().firstChild.className;
}

function getRowClass() {
	return getFirstSkill().parentElement.className;
}

// --------------------------------------
// Skill-related methods Section
// --------------------------------------

function isCurrentCourse(x) {
	return x.learningLanguage === duoState.user.learningLanguage &&
		x.fromLanguage === duoState.user.fromLanguage;
}

function readDuoState() {
	// log("readDuoState");
	duoState = JSON.parse(localStorage['duo.state']);
	course_skills = Object.values(duoState.skills).filter(isCurrentCourse);
	skills = course_skills.filter(skill => skill.hasOwnProperty('bonus') == false);

	// Give all skills an index.
	// Makes it easy to find the array position for any given skill
	// Calculate progress for all skills
	skills.forEach((skill, index) => {
		skill.index = index;
		skill.currentProgress = skill.finishedLevels +
			skill.finishedLessons / skill.lessons
	});
	// log("Read the configuration!");
}

function readConfig() {
	let local_config_name = 'duo.nextlesson.' + duoState.user.learningLanguage +
		'.' + duoState.user.fromLanguage;
	let default_values = { min_slope: 2, max_slope: 6, max_level: 5, sequential: true };
	let default_config = JSON.parse(GM_getValue("duo.nextlesson", JSON.stringify(default_values)));
	var local_config = JSON.parse(GM_getValue(local_config_name, JSON.stringify(default_config)));
	// log(local_config)
	return local_config;
}

function applyStep(skill, index) {
	// 1 ≤ currentProgress ≤ TargetCrownLevel ≤ max_level
	skill.targetCrownLevel = Math.max(
		Math.min(this.target_level - this.step * (index),
			this.target_level), skill.currentProgress);

	skill.crownWeight = skill.targetCrownLevel - skill.currentProgress;
	// log("S:" + skill.shortName + " " + index + " T:" + skill.targetCrownLevel.toFixed(4) + " W:" + skill.crownWeight.toFixed(4));
	return skill;
}

function updateCrownLevel(local_config) {
	// Read configuration
	let max_slope = parseFloat(local_config.max_slope);
	let min_slope = parseFloat(local_config.min_slope);
	let sequential_tree = local_config.sequential;
	let max_level = parseFloat(local_config.max_level);
	// Calculate the desired slope values
	let min_step = max_level / Math.ceil(skills.length / min_slope);
	let max_step = max_level / Math.ceil(skills.length / max_slope);
	// log("MinS:" + min_step.toFixed(4) + " MaxS:" + max_step.toFixed(4))

	let active_skills = skills.filter(skill =>
		(skill.currentProgress < max_level) && (skill.accessible == true));
	if (active_skills.length == 0) {
		// log("Finished tree, random skill selection");
		return skills.randomElement()
	}
	let last_skill = active_skills[active_skills.length - 1];
	let last_row = active_skills.filter(skill => skill.row == last_skill.row && skill.finishedLevels == 0);
	let first_skill = active_skills[0];
	let active_segment = last_skill.index - first_skill.index;
	let last_skill_progress = (last_skill == skills[skills.length - 1]) ? last_skill.currentProgress : 0;
	let active_step = (first_skill.currentProgress - last_skill_progress) / active_segment;
	// log("First Skill: " + first_skill.shortName + " " +  first_skill.currentProgress + " Last Skill:" + last_skill.shortName + " " +  last_skill_progress);
	// log("Segment length: " + active_segment + " Step: " + active_step.toFixed(4));

	let step = Math.max(Math.min(active_step, max_step), min_step);

	// log("Step:" + step);
	active_skills.forEach(applyStep, { target_level: max_level, step: step });

	// Complete skills in unlocked rows sequentially
	if (sequential_tree && last_row.length > 1) {
		for (let index = 1; index < last_row.length; index++) {
			last_row[index].crownWeight = 0;
		}
	}

	var max_weight = active_skills.reduce((acc, skill) => acc = Math.max(acc, skill.crownWeight), 0);
	// log("Max weight: " + max_weight.toFixed(4));
	// log(skills.filter(skill => skill.crownWeight >= (max_weight - 0.1)));
	var next_skill = skills.filter(skill => skill.crownWeight > 0 && skill.crownWeight >= (max_weight - 0.1)).randomElement();
	// log("Next skill: " + next_skill.shortName);
	// log(skills);
	return next_skill;
}

// This dead code is here an not at the bottom of the file so I can easily
// copy-paste the important parts of the script into firefox.
// var local_config = {min_slope: 2, max_slope: 2, max_level: 5, sequential: true};
// readDuoState(); updateCrownLevel(local_config);
// skills.forEach(x => res = {w: x.crownWeight, n: x.shortName})
// skills.forEach(x => res = {w: x.crownWeight, t: x.targetCrownLevel, c: x.currentProgress, n: x.shortName })
// var totalLessons = course_skills.map(x => x.lessons).reduce((a, b) => a + b, 0);
// log("Total visible lessons: " + totalLessons);
// skills.filter( (skill, i, a) => i > 0 ? skill.row != a[i - 1].row : true ).map(skill => skill.targetCrownLevel)

// --------------------------------------
// Interaction Section
// --------------------------------------

function removeObsoleteNextLessonButton() {
	// log("removeObsoleteNextLessonButton");
	var button = document.getElementById(K_NEXT_LESSON_BUTTON_ID);
	if (button != null) {
		getPracticeAnchor().parentElement.removeChild(button);
	}
}

function createLessonButton(skill) {
	// log("createLessonButton");
	removeObsoleteNextLessonButton();

	// prepare the next lesson button
	var button = document.createElement("button");
	button.id = K_NEXT_LESSON_BUTTON_ID;
	button.type = "button";
	button.textContent = "Start " + skill.shortName;
	button.onclick = function () {
		window.location.href = skillURL(skill);
	};
	button.className = K_BUTTON_CLASS + " duolingonextlesson";
	button.style = "width: auto;";

	// append button into place
	getPracticeAnchor().parentElement.appendChild(button);
}

function tagAllSkills() {
	var skill_names = Array.prototype.slice.call(document.getElementsByClassName(K_SHORT_NAME));
	var skill_index = 0;
	skill_names.forEach(skill => {
		// Ignore bonus skills
		if (skill.textContent == skills[skill_index].shortName) {
			skills[skill_index].shortNameElement = skill;
			skill_index++;
		}
	})
}

function clickNextLesson(next_skill) {
	if (GM_getValue("auto_scroll_to_next", K_AUTO_SCROLL_TO_NEXT)) {
		next_skill.scrollIntoView(false);
		next_skill.firstChild.firstChild.click();
	}
}

function skillURL(skill) {
	var URL = "/skill/" +
		skill.learningLanguage + "/" +
		skill.urlName + "/"
	if (skill.finishedLevels < 5) {
		URL = URL + (1 + skill.finishedLessons);
	} else {
		URL = URL + "practice"
	}
	return URL;
}

/* Move all cracked skills to a new section at the beginning of the tree */
function toDoNextSkills(next_skill, move_cracked_skills) {
	var cracked_skills = skills.filter(skill => skill.decayed == true).map(skill => skill.shortNameElement.parentN(3));
	cracked_skills.push(next_skill); // Include also next_skill
	let c_size = 3;
	var cracked_chunks = Array(Math.ceil(cracked_skills.length / c_size)).fill().map((_, i) => cracked_skills.slice(i * c_size, i * c_size + c_size));
	var section = document.createElement("div")
	var subsection = document.createElement("div")
	var firstSection = getTreeSection();
	section.className = firstSection.className + " duolingonextlesson";
	subsection.className = getTreeSubsectionClass() + " duolingonextlesson";
	firstSection.parentElement.insertBefore(section, firstSection);
	var rows = cracked_chunks.map(chunk => {
		var row = document.createElement("div");
		row.className = getRowClass()  + " duolingonextlesson";
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
	rows.forEach(row => subsection.appendChild(row));
}

function findNextLesson() {
	// log("findNextLesson");
	// Remove all old elements
	var to_remove = document.getElementsByClassName("duolingonextlesson");
	while (to_remove[0]) {
		to_remove[0].parentNode.removeChild(to_remove[0]);
	}
	document.getElementsByClassName(K_SHORT_NAME)[0].parentNode.id = K_FIRST_SKILL_ITEM_ID;

	// Find the next lesson to study
	readDuoState();
	var local_config = readConfig();
	var next_skill = updateCrownLevel(local_config);
	tagAllSkills();
	if (GM_getValue('create_exercise_button', K_CREATE_EXERCISE_BUTTON)) {
		createLessonButton(next_skill);
	}
	var selected_skill = next_skill.shortNameElement.parentN(3);
	toDoNextSkills(selected_skill, GM_getValue('move_cracked_skills', K_MOVE_CRACKED_SKILLS));
	clickNextLesson(selected_skill);
}

function onChangeNextLesson(mutationsList) {

	/* Add a "NEXT LESSON" button when necessary */
	if (getDuoTree() != null) {
		if (document.getElementById(K_FIRST_SKILL_ITEM_ID) == null) {
			findNextLesson();
		}
	}

	/* List the number of lessons missing in the current level */
	for (var i = 0; i < mutationsList.length; ++i) {
		var mutation = mutationsList[i];
		if (mutation.type === 'childList') {
			// var target = mutation.target;
			// log(target.className);
		}
	}
}

new MutationObserver(onChangeNextLesson).observe(document.body, {
	childList: true,
	subtree: true
});

log("version " + GM_info.script.version + " ready");
