// ==UserScript==
// @name        Duolingo Next Lesson
// @namespace   local
// @include     https://www.duolingo.com/*
// @author      Camilo
// @version     0.6.3
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
//		local_config = {divider: 4, min:1, initial: 1, linear: 0, sequential: true}
//		localStorage.setItem('duo.nextlesson.es.en', JSON.stringify(local_config))
// In this example, duo.nextlesson.es.en means Spanish for English speakers.
// Adjust the name for the course you want to configure.
// You can also change the global settings by modifying the code bellow
// WARNING!!! If you edit the script, you'll have to upgrade it manually
//
// STEP = max(STEP_MIN, finishedRows/STEP_DIVIDER)
// Example settings for (min, divider, initial):
//	(4, 1, 1) : at least 25% of rows at level 5, at most 25% at level 4 and so on.
//	(4, 1, 0) : Same as before, but more lessons from new skills
//	(2, 1, 1) : 50% of finished rows at level 2, 50% at level 3.
//	(1, 1, 1) : All rows pointing to level 2 until the end of the tree.
//	(4, 2, 1) : Same as (1, 4, 1) but keep it slow until the first shortcut.
//	(4, 2, 1) : Same as (1, 4, 1) but keep it slow until the first shortcut.

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

// Set it to 0 to divide the tree in equal-sized blocks.
// Set it to -1 to advance faster
// Set it to 1 to reach level 5 before advancing
let LINEAR = (local_config == null) ? 0:local_config.linear;

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
	var last_row = tree.length - 1;
	var unfinished_skills = skills.filter(skill =>
		skill.finishedLevels == 0);
	if (unfinished_skills.length > 0) {
		last_row = unfinished_skills[0].row;
	}
	// TODO: Bonus skills need to be processed a bit different since
	// they use the same row number of other skills
	
	// Calculate the minimum targetCrownLevel
	var last_skills = skills.filter(skill => skill.row == last_row);
	var target_crown_level = last_skills.reduce(
			(acc, skill) => Math.min(acc, skill.finishedLevels + 1), 5);
	course_skills.map(skill => skill.targetCrownLevel = target_crown_level)
	// Split the rows. A lot of magic here
	var divider = (LINEAR == 0) ? STEP_DIVIDER : (STEP_DIVIDER + 1) * STEP_DIVIDER / 2;
	var level_step = Math.max(last_row / divider, STEP_MIN);
	var current_step = (LINEAR >=0) ? level_step :
		Math.ceil(STEP_DIVIDER * last_row / divider) + level_step;
	
	// Increase targetCrownLevel for earlier skills
	for (i = last_row - STEP_INITIAL;
		(i >= 0) && (++target_crown_level <= 5);
		i -= current_step) {
		skills.filter(skill => skill.row <= Math.max(i, 0)).
			map(skill => skill.targetCrownLevel = target_crown_level);
		if (LINEAR != 0) current_step += LINEAR * level_step;
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
// STEP_MIN = 1; STEP_DIVIDER = 4; STEP_INITIAL = 1; SEQUENTIAL_TREE = true; LINEAR = 0
// readDuoState();
// updateCrownLevel();
// skills.map(x => res = {w: x.crownWeight, t: x.targetCrownLevel, c: x.finishedLevels})

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
} else {
	console.debug("No crowns for you yet");
}

