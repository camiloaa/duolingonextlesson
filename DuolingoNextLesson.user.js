// ==UserScript==
// @name        Duolingo Next Lesson
// @namespace   local
// @include     https://www.duolingo.com/*
// @author      Camilo
// @version     0.7
// @description Add a "START NEW LESSON" button in Duolingo.
// @grant	none
// @downloadURL https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// @updateURL   https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// ==/UserScript==

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

readDuoState();
let local_config_name = 'duo.nextlesson.' + duoState.user.learningLanguage +
					'.' + duoState.user.fromLanguage;
let local_config = JSON.parse(localStorage.getItem(local_config_name));
console.debug(local_config)

// Configuration constants:
// You can create your own per-course configuration using localStorage.
//		local_config = {divider: 4, min:1, initial: 1, lineal: 0, sequential: true}
//		localStorage.setItem('duo.nextlesson.es.en', JSON.stringify(local_config))
// In this example, duo.nextlesson.es.en means Spanish for English speakers.
// Adjust the name for the course you want to configure.
// You can also change the global settings by modifying the code directly
// WARNING!!! If you edit the script, you'll have to upgrade it manually
//
// STEP = max(STEP_MIN, finishedRows/STEP_DIVIDER)
// Example settings for (divider, min, initial, lineal):
//	(4, 1, 1, -1) : 10% of rows at level 5, 20% @ 4, 30% @ 3, 40% @ 2. (DEFAULT)
//	(4, 1, 1, 0)  : at least 25% of rows at level 5, at most 25% at level 4 and so on.
//	(3, 1, 0, 0)  : Same as before, but more lessons from new skills
//	(2, 1, 1, 0)  : 50% of finished rows at level 2, 50% at level 3.
//	(1, 1, 1, 0)  : All rows pointing to level 2 until the end of the tree.
//	(4, 2, 1, 0)  : Same as (1, 4, 1) but keep it slow until the first shortcut.
//	(4, 2, 1, 0)  : Same as (1, 4, 1) but keep it slow until the first shortcut.

//Split tree in STEP_DIVIDER sections (STEP_DIVIDER > 0)
let STEP_DIVIDER = (local_config == null) ? 4:local_config.divider;
						// Bigger values => reach level 5 before new lessons
						// Smaller values => get new lessons more often
						// Values below 1 make no difference
// Minimum size of the section (STEP_MIN > 0)
let STEP_MIN = (local_config == null) ? 1:local_config.min;
						// Bigger values => get new lessons more often
						// Smaller values => reach level 5 before new lessons
						// Zero (0) is not a valid value!
// How many rows should cound as "just studied"
// Set it to 0 to study new lessons before old
// Set it to a possitive number to study older lessons first
let STEP_INITIAL = (local_config == null) ? 1:local_config.initial;

// Set it to -1 to have more new lessons (Default)
// Set it to 0 to study evenly across the tree
// Set it to 1 to have more older lessons to study
let LINEAL = (local_config == null) ? -1:local_config.lineal;

//Complete skills in unlocked rows sequentially
let SEQUENTIAL_TREE = (local_config == null) ? true:local_config.sequential;

// UI Constants
let K_SIDE_PANEL = "_21w25 _1E3L7";
let K_GLOBAL_PRACTICE = "_6Hq2p _3FQrh _1uzK0 _3f25b _2arQ0 _3skMI _2ESN4";
let K_DUOTREE = "mAsUf";
let K_CONFIG_BUTTON = "_3LN9C _3e75V _3f25b _3hso2 _3skMI oNqWF _3hso2 _3skMI";

function isCurrentCourse(x)
{
	return x.learningLanguage === duoState.user.learningLanguage &&
		x.fromLanguage === duoState.user.fromLanguage;
}

function readDuoState() {
	duoState = JSON.parse(localStorage['duo.state']);
	course_skills = Object.values(duoState.skills).filter(isCurrentCourse);
	skills = course_skills.filter(skill => skill.accessible == true);
	current_course = Object.values(duoState.courses).filter(isCurrentCourse)[0];
	tree = current_course.skills.map(row => row.map (skill => {
		duoState.skills[skill].targetCrownLevel = 1;
		return duoState.skills[skill];
	}))
	totalLessons = course_skills.map(x => x.lessons).reduce((a, b) => a + b, 0);
	course_keys = Object.keys(current_course.trackingProperties);
}

function updateCrownLevel() {
	// Find the last completed row
	var last_row = skills.reduce((acc, skill) => Math.max(acc, skill.row), 0);
	let total_rows = course_skills.reduce((acc, skill) =>
		Math.max(acc, skill.row), 0);
	let unfinished_skills = skills.filter(skill =>
		skill.finishedLevels == 0);
	let finished_tree = (total_rows == last_row) &&
		unfinished_skills.length == 0;
	if (unfinished_skills.length > 0) {
		last_row = unfinished_skills[0].row;
	}
	let min_skill = skills.filter(skill => skill.finishedLevels < 5).
		reduce((acc, skill) => Math.min(acc, skill.row), last_row)
	let FIRST_ROW = (finished_tree) ?
			skills.filter(skill => skill.finishedLevels < 5).
				reduce((acc, skill) => Math.min(acc, skill.row), last_row) : 0;

	// TODO: Bonus skills need to be processed a bit different since
	// they use the same row number as other skills
	
	// Calculate the minimum targetCrownLevel
	var last_skills = skills.filter(skill => skill.row == last_row);
	var target_crown_level = last_skills.reduce(
			(acc, skill) => Math.min(acc, skill.finishedLevels + 1), 5);
	course_skills.map(skill => skill.targetCrownLevel = target_crown_level)
	// Split the rows. A lot of magic here
	var divider = (LINEAL == 0) ? STEP_DIVIDER : (STEP_DIVIDER + 1) * STEP_DIVIDER / 2;
	var level_step = Math.max((last_row - FIRST_ROW) / divider, STEP_MIN);
	var current_step = (LINEAL >=0) ? level_step :
		STEP_DIVIDER * (last_row - FIRST_ROW) / divider + level_step;
	
	// Tweak initial condition for finished trees
	if (finished_tree) {
		last_row += STEP_INITIAL;
		target_crown_level--;
	}
	// Increase targetCrownLevel for earlier skills
	for (i = last_row - STEP_INITIAL;
		(i >= FIRST_ROW) && (++target_crown_level <= 5);
		i -= current_step) {
		skills.filter(skill => skill.row <= Math.max(i, 0)).
			map(skill => skill.targetCrownLevel = target_crown_level);
		if (LINEAL != 0) current_step += LINEAL * level_step;
		current_step = Math.max(current_step, STEP_MIN);
	}
	skills.map(skill => skill.crownWeight =
		Math.max(skill.targetCrownLevel - skill.finishedLevels 
				- skill.finishedLessons/skill.lessons, 0));
	if (SEQUENTIAL_TREE) {
		for (var i = 1; i < unfinished_skills.length; i++) {
			// Ignore other unfinished skills
			unfinished_skills[i].crownWeight = 0;
		}
	}
	var max_weight = skills.reduce( (acc,skill) => 
		acc = Math.max(acc, skill.crownWeight), 0);
	next_skill = skills.filter(skill => skill.crownWeight == max_weight)[0];
}

// This dead code is here an not at the bottom of the file so I can easily
// copy-paste the important parts of the script into firefox.
// STEP_MIN = 1; STEP_DIVIDER = 4; STEP_INITIAL = 1; SEQUENTIAL_TREE = true; LINEAL = 0
// readDuoState();
// updateCrownLevel();
// skills.map(x => res = {w: x.crownWeight, t: x.targetCrownLevel, c: x.finishedLevels})
// skills.filter( (skill, i, a) => i > 0 ? skill.row != a[i - 1].row : true ).map(skill => skill.targetCrownLevel)

function createLessonButton(skill) {
	var sidepanel = document.getElementsByClassName(K_SIDE_PANEL);
	var duotree = document.getElementsByClassName(K_DUOTREE)[0];
	
	var button = document.createElement("button");
	button.id = "next-lesson-button";
	button.type = "button";
	button.textContent = "START NEW LESSON";
	button.onclick = function () {
		window.location.href= skillURL(skill);};
	if (sidepanel.length > 0) {
		button.className = K_GLOBAL_PRACTICE;
	    button.style = "margin-top: 10px;"
	    	+ "display: block;"
	        + "visibility: visible;";
		sidepanel[0].appendChild(button);
	} else {
		button.className = K_CONFIG_BUTTON
			+ " reverse-tree-enhancer-button";
		button.style = "margin-left: 5px; height: 42px; "
			+ "display: block;"
			+ "visibility: visible;";
		duotree.insertBefore(button, duotree.firstChild);
	}
}

function skillURL(skill) {
	return "/skill/" +
		skill.learningLanguage + "/" +
		skill.urlName + "/" +
		(1+skill.finishedLessons);
}

/* Add a "NEXT LESSON" button when necessary */
function onChange(_) {
	var duotree = document.getElementsByClassName(K_DUOTREE);
	if (document.getElementById("next-lesson-button") == null
			&& duotree.length != 0) {
		readDuoState();
		updateCrownLevel();
		createLessonButton(next_skill);
	}
}

if (course_keys.includes("total_crowns")) {
	new MutationObserver(onChange).observe(document.body, {
	    childList : true,
	    subtree : true
	});

    console.debug("DuolingoNextLesson version " + GM_info.script.version
            + " ready");
	onChange();
} else {
	console.debug("No crowns for you yet");
}


/* Unit testing
 *
 */

function generateTestData() {
	let rows = [0, 0, 1, 1, 2, 3, 3, 4, 5, 5, 5, 6, 6, 6, 7, 7, 8, 8, 9, 9, 9,
		10, 10, 11, 12, 13, 13, 13, 14, 14, 15, 16, 17, 17, 18, 18, 19, 19, 19,
		20, 21, 21, 21, 21, 22, 23, 23, 24, 24, 25, 25, 26, 27, 27, 27, 28, 28,
		29, 29, 30, 30, 30, 31, 31, 31, 32, 33, 34, 35, 35, 36, 36, 37, 37, 38,
		38, 39, 39, 40, 40];
	let finished_rows = [0, 1, 8, 10, 30, 40, 41];

	return finished_rows.map(f => rows.map( r => {
			var skill = {row: r, finishedLevels: 0, accessible: false,
					finishedLessons: 0, lessons: 3};
			if (r < f) {
				skill.finishedLevels = 1;
				skill.accessible = true;
			} else if (r == f) {
				skill.accessible = true;
			}
			return skill;
		}
	));
}

function setSkillLevel(level, row) {
	skills.filter(skill => skill.row <= row).
		map(skill => skill.finishedLevels = level)
}

// course_skills = generateTestData()[2]
// skills = course_skills.filter(skill => skill.accessible == true)
