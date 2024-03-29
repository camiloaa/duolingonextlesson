// ==UserScript==
// @name        Duolingo Next Lesson
// @namespace   local
// @include     https://www.duolingo.com/*
// @include     https://preview.duolingo.com/*
// @author      Camilo Arboleda
// @version     1.3.8
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
// Button class remain hard-coded for compatibility reasons with small screens
let K_BUTTON_CLASS = "_3HHNB _2A7uO _2gwtT _1nlVc _2fOC9 t5wFJ _3dtSu _25Cnc _3yAjN _3Ev3S _1figt";

let K_PLUGIN_NAME = "DuolingoNextLesson";
let K_FIRST_SKILL_ITEM_ID = "skill-tree-first-item";
let K_NEXT_LESSON_BUTTON_ID = "next-lesson-button";

// Default setup
let K_MOVE_CRACKED_SKILLS = false;
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
var _i = document.createElement('iframe');
_i.style.display = 'none';
document.body.appendChild(_i);
console_alt = _i.contentWindow.console;

function debug(objectToLog) {
	console_alt.debug("[" + K_PLUGIN_NAME + "]: %o", objectToLog);
}

function info(objectToLog) {
    console_alt.info("[" + K_PLUGIN_NAME + "]: %o", objectToLog);
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

/* Random number generator for small numer */
function rnumber(max) {
	const r = Math.floor(Math.random() * 1000) % max;
	return r;
}

/* Chi-square random number generator for single digit numbers */
function chi_rnumber(max) {
	var x = rnumber(max*3);
	while ((x >= max) && (x>0)) {
		x = x - max;
		max--;
	}
	return x;
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

function getElementsByDataTestValue(data_test) {
    return document.querySelectorAll("[data-test='" + data_test + "']");
}

function getDuoTree() {
	// <div data-test="skill-tree" class="nae5G">
	return getFirstElementByDataTestValue(K_DUO_TREE_DATA_TEST);
}

function getSkills() {
	// <div class="_2iiJH _1DMov" data-test="skill">
	return getElementsByDataTestValue(K_SKILL_DATA_TEST);
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
	//debug("readDuoState");
	duoState = JSON.parse(localStorage['duo.state']);
	course_skills = Object.values(duoState.skills).filter(isCurrentCourse);
	skills = course_skills.filter(skill => // Ignore inaccessible bonus and grammar skills
		!skill.hasOwnProperty('bonus')
		&& !skill.hasOwnProperty('grammar')
		|| skill.accessible);

	// Give all skills an index.
	// Makes it easy to find the array position for any given skill
	// Calculate progress for all skills
	skills.forEach((skill, index) => {
		skill.index = index;
		skill.currentProgress = skill.finishedLevels +
			skill.finishedLessons / skill.lessons
	});
	//debug("Read the configuration!");
}

function readConfig() {
	let local_config_name = 'duo.nextlesson.' + duoState.user.learningLanguage +
		'.' + duoState.user.fromLanguage;
	let default_values = { min_slope: 2, max_slope: 6, max_level: 5, sequential: true };
	let default_config = JSON.parse(GM_getValue("duo.nextlesson", JSON.stringify(default_values)));
	var local_config = JSON.parse(GM_getValue(local_config_name, JSON.stringify(default_config)));
	//debug(local_config)
	return local_config;
}

function applyStep(skill, index) {
	// 1 ≤ currentProgress ≤ TargetCrownLevel ≤ max_level
	skill.targetCrownLevel = Math.max(skill.maxLevel - this.step * (index), 0);
	if (skill.hasOwnProperty('bonus')) {
		// Bonus skills have no levels
		skill.targetCrownLevel = Math.min(skill.targetCrownLevel, 1.0);
	} else if (skill.hasOwnProperty('grammar')) {
		// Grammar skills have only two levels
		skill.targetCrownLevel = Math.min(skill.targetCrownLevel, 2.0);
	}
	skill.targetCrownLevel = Math.max(skill.targetCrownLevel, skill.currentProgress);
	skill.crownWeight = skill.targetCrownLevel - skill.currentProgress;
	//debug("S:" + skill.shortName + " " + index + " T:" + skill.targetCrownLevel.toFixed(4)
	//		+ " W:" + skill.crownWeight.toFixed(4));
	return skill;
}

function updateCrownLevel(local_config) {
	// Read configuration
	const max_slope = parseFloat(local_config.max_slope);
	const min_slope = parseFloat(local_config.min_slope);
	const sequential_tree = local_config.sequential;
	const max_level = parseFloat(local_config.max_level);
	// Calculate the desired slope values
	const min_step = Math.abs(max_level) / Math.ceil(skills.length / min_slope);
	const max_step = Math.abs(max_level) / Math.ceil(skills.length / max_slope);
	//debug("MinS:" + min_step.toFixed(4) + " MaxS:" + max_step.toFixed(4))

	skills.forEach(skill => {
		if (max_level > 0) {
			skill.maxLevel = max_level;
		} else {
			if (skill.finishedLevels < Math.abs(max_level) - 1) {
				skill.maxLevel = Math.abs(max_level) - 0.2;
			} else {
				skill.maxLevel = Math.abs(max_level) - 1 / skill.lessons;
			}
		}
	} )
	let active_skills = skills.filter(skill =>
		(skill.currentProgress < skill.maxLevel) && (skill.accessible == true));
	if (active_skills.length == 0) {
		//debug("Finished tree, random skill selection");
		return skills[rnumber(skills.length)]
	}
	const last_skill = active_skills[active_skills.length - 1];
	let last_row = active_skills.filter(skill =>
			skill.row == last_skill.row && skill.finishedLevels == 0);
	const first_skill = active_skills[0];
	const active_segment = last_skill.index - first_skill.index;
	const last_skill_progress = (last_skill == skills[skills.length - 1]) ?
			last_skill.currentProgress : 0;
	const active_step = (first_skill.currentProgress - last_skill_progress) / active_segment;
	//debug("First Skill: " + first_skill.shortName + " " +  first_skill.currentProgress
	//		+ " Last Skill:" + last_skill.shortName + " " +  last_skill_progress);
	//debug("Segment length: " + active_segment + " Step: " + active_step.toFixed(4));

	const step = Math.max(Math.min(active_step, max_step), min_step);

	//debug("Step:" + step);
	active_skills.forEach(applyStep, { step: step });

	// Complete skills in unlocked rows sequentially
	if (sequential_tree && (last_row.length > 0)) {
		last_row.forEach(skill => {skill.bcw = skill.crownWeight; skill.crownWeight = 0});
		last_row[0].crownWeight = last_row[0].bcw;
	}
	var max_weight = active_skills.sort((a, b) =>
			{return b.crownWeight - a.crownWeight; }).slice(0,5);
	//debug(max_weight);
	var next_skill = max_weight[chi_rnumber(max_weight.length)];
	//debug("Next skill: " + next_skill.shortName);
	//debug(skills);
	return next_skill;
}

// This dead code is here an not at the bottom of the file so I can easily
// copy-paste the important parts of the script into firefox.
// var local_config = {min_slope: 2, max_slope: 2, max_level: 5, sequential: true};
// readDuoState(); updateCrownLevel(local_config);
// skills.forEach(x => res = {w: x.crownWeight, n: x.shortName})
// skills.forEach(x => res = {w: x.crownWeight, t: x.targetCrownLevel, c: x.currentProgress, n: x.shortName })
// var totalLessons = skills.map(x => x.lessons).reduce((a, b) => a + b, 0);
// debug("Total visible lessons: " + totalLessons);
// skills.filter( (skill, i, a) => i > 0 ? skill.row != a[i - 1].row : true ).map(skill => skill.targetCrownLevel)

// --------------------------------------
// Interaction Section
// --------------------------------------

function removeObsoleteNextLessonButton() {
	//debug("removeObsoleteNextLessonButton");
	var button = document.getElementById(K_NEXT_LESSON_BUTTON_ID);
	if (button != null) {
		getPracticeAnchor().parentElement.removeChild(button);
	}
}

function createLessonButton(skill) {
	//debug("createLessonButton");
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
	const skill_nodes = Array.prototype.slice.call(getSkills());
	var skill_index = 0;
	skill_nodes.forEach(skill => {
		var all_div = skill.getElementsByTagName("div")
		skill_name = all_div[all_div.length - 1];
		//debug(skill_name.textContent);
		//debug(skill_name);
		// Ignore bonus skills
		if (skill_name.textContent == skills[skill_index].shortName) {
			skills[skill_index].shortNameElement = skill_name;
			skill_index++;
		}
	})
}

function clickNextLesson(todo_section) {
	if (GM_getValue("auto_scroll_to_next", todo_section.length == 1)) {
		const next_skill = todo_section[rnumber(todo_section.length)];
		next_skill.scrollIntoView(false);
		next_skill.firstChild.firstChild.click();
	} else{
		window.scrollTo(0,0);
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
	var cracked_skills = skills.filter(skill =>skill.decayed == true).map(skill => skill.shortNameElement.parentN(3));
	cracked_skills.push(next_skill); // Include also next_skill
	let c_size = 3;
	var cracked_chunks = Array(Math.ceil(cracked_skills.length / c_size))
			.fill().map((_, i) => cracked_skills.slice(i * c_size, i * c_size + c_size));
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
				my_keys.forEach(key => cloned.firstChild.firstChild[key]
						= item.firstChild.firstChild[key]);
				row.appendChild(cloned);
			});
		}
		return row;
	})
	section.appendChild(subsection)
	rows.forEach(row => subsection.appendChild(row));
	return cracked_skills;
}

function findNextLesson() {
	//debug("findNextLesson");
	// Remove all old elements
	var to_remove = document.getElementsByClassName("duolingonextlesson");
	while (to_remove[0]) {
		to_remove[0].parentNode.removeChild(to_remove[0]);
	}
	getFirstSkill().firstChild.id = K_FIRST_SKILL_ITEM_ID;

	// Find the next lesson to study
	readDuoState();
	var local_config = readConfig();
	var next_skill = updateCrownLevel(local_config);
	tagAllSkills();
	if (GM_getValue('create_exercise_button', K_CREATE_EXERCISE_BUTTON)) {
		createLessonButton(next_skill);
	}
	const selected_skill = next_skill.shortNameElement.parentN(3);
	const todo_section = toDoNextSkills(selected_skill,
			GM_getValue('move_cracked_skills', K_MOVE_CRACKED_SKILLS));
	clickNextLesson(todo_section);
}

function onChangeNextLesson(mutationsList) {

	/* Add a "NEXT LESSON" button when necessary */
	if (getDuoTree() != null) {
		//debug("There is a tree");
		if (document.getElementById(K_FIRST_SKILL_ITEM_ID) == null) {
			//debug("Find next lesson");
			findNextLesson();
		}
	} else {
		//debug("There is a change but no tree");
	}

	/* List the number of lessons missing in the current level */
	for (var i = 0; i < mutationsList.length; ++i) {
		var mutation = mutationsList[i];
		if (mutation.type === 'childList') {
			// var target = mutation.target;
			//debug(target.className);
		}
	}
}

new MutationObserver(onChangeNextLesson).observe(document.body, {
	childList: true,
	subtree: true
});

info("version " + GM_info.script.version + " ready");
