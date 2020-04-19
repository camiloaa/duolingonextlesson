// ==UserScript==
// @name        Duolingo Next Lesson
// @namespace   local
// @include     https://www.duolingo.com/*
// @author      Camilo Arboleda
// @version     1.2.11
// @description Add a "START LESSON" button in Duolingo. Check the README for more magic
// @grant       GM_getValue
// @grant       GM_setValue
// @downloadURL https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// @updateURL   https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// ==/UserScript==

// UI Constants
let K_SHORT_NAME = "_1j18D";
let K_DUO_TREE_DATA_TEST = "skill-tree";
let K_SKILL_DATA_TEST = "skill";
let K_PRACTICE_BUTTON_DATA_TEST = "global-practice";
let K_TREE_SECTION_DATA_TEST = "tree-section";

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

// max_slope/min_slope: Maximum and minimum difference in crowns between
//		the first active skill and the last skill in the course
//		Higher slope means you have to repeat earlier lessons first.
//		Lower slope means you can advance the course faster.
// max_level: level you want to reach in all skills
// sequential: Complete the tree left to right
//
// duo.nextleson
// "{\"min_slope\":2,\"max_slope\":6,\"max_level\":4.8,\"sequential\":true}"


Array.prototype.randomElement = function() {
	return this[Math.floor(Math.random() * this.length)]
}

Element.prototype.parentN = function(n) {
	if (parseInt(n) <= 0) {
		return this;
	}
	return this.parentElement.parentN(n - 1);
}

function isCurrentCourse(x) {
	return x.learningLanguage === duoState.user.learningLanguage &&
		x.fromLanguage === duoState.user.fromLanguage;
}

function readDuoState() {
	duoState = JSON.parse(localStorage['duo.state']);
	course_skills = Object.values(duoState.skills).filter(isCurrentCourse);
	skills = course_skills.filter(skill => skill.accessible == true &&
		skill.hasOwnProperty('bonus') == false);
	current_course = Object.values(duoState.courses).filter(isCurrentCourse)[0];
	tree = current_course.skills.map(row => row.map(skill => {
		duoState.skills[skill].targetCrownLevel = 1;
		return duoState.skills[skill];
	}))
	course_keys = Object.keys(current_course.trackingProperties);
	log("Read the configuration!");
}

function readConfig() {
	let local_config_name = 'duo.nextlesson.' + duoState.user.learningLanguage +
		'.' + duoState.user.fromLanguage;
	let default_values = {
		min_slope: 4,
		max_slope: 8,
		max_level: 5,
		sequential: true
	};
	let default_config = JSON.parse(GM_getValue("duo.nextlesson", JSON.stringify(default_values)));
	var local_config = JSON.parse(GM_getValue(local_config_name, JSON.stringify(default_config)));
	log(local_config)
	return local_config;
}

function updateCrownLevel(local_config) {
	// Read configuration
	let max_slope = parseFloat(local_config.max_slope);
	let min_slope = parseFloat(local_config.min_slope);
	let sequential_tree = local_config.sequential;
	let max_level = parseFloat(local_config.max_level);

	// Give all skills an index.
	// Calculate progress for all skills (note: finished skills get currentProgress 6 instead of 5. Does not matter for us)
	skills.forEach((skill, index) => {
		skill.index = index;
		return skill.currentProgress = skill.finishedLevels + skill.finishedLessons / skill.lessons;
	});

	let active_skills = skills.filter(skill => skill.currentProgress < max_level);
	if (active_skills.length == 0) {
		log("Finished tree, random skill selection");
		return skills.randomElement();
	}
	let last_skill = skills[skills.length - 1];
	let first_skill = active_skills.length > 0 ? active_skills[0] : skills[0];
	let current_slope = last_skill.row - first_skill.row;

	// apply "correct slope" strategy
	if (current_slope < min_slope) {
	    // slope too low -> prefer opening new skills, pick from last row
	    active_skills = active_skills.filter(skill => skill.row == last_skill.row);
	} else if (current_slope > max_slope) {
        // slope too high - cut off opened skills that should not be trained yet
        let max_row = first_skill.row + max_slope;
        active_skills = active_skills.filter(skill => skill.row < max_row);
	}

	let target_crown_level_step = (max_level - 1) / (max_slope - 1);
    active_skills.forEach((skill) => {
        row_distance_from_first_skill = skill.row - first_skill.row;
        skill.targetCrownLevel = max_level - row_distance_from_first_skill * target_crown_level_step;
        skill.crownWeight = (skill.targetCrownLevel - skill.currentProgress).toFixed(1);
    });

	// Complete skills in unlocked rows sequentially
	if (sequential_tree) {
        let last_row = skills.filter(skill => skill.row == last_skill.row);
	    if (last_row.length > 1) {
	    	for (let index = 1; index < last_row.length; index++) {
	    		last_row[index].crownWeight = 0;
	    	}
	    }
	}

	// select random skill with the highest crown weight
	var max_weight = active_skills.reduce((acc,skill) => acc = Math.max(acc, skill.crownWeight), 0);
	var candidate_skills = active_skills.filter(skill => skill.crownWeight == max_weight);
	var next_skill = candidate_skills.randomElement();
	log(new Map([
	    ["Max weight", max_weight],
	    ["Selected skill", next_skill.shortName],
	    [ "Candidate skills", candidate_skills]
	]));
	return next_skill;
}

// This dead code is here an not at the bottom of the file so I can easily
// copy-paste the important parts of the script into firefox.
// var local_config = {min_slope: 2, max_slope: 2, max_level: 5, sequential: true};
// readDuoState(); updateCrownLevel(local_config);
// skills.forEach(x => res = {w: x.crownWeight, n: x.shortName})
// skills.forEach(x => res = {w: x.crownWeight, t: x.targetCrownLevel, c: x.currentProgress, n: x.shortName })
// var totalLessons = course_skills.map(x => x.lessons).reduce((a, b) => a + b, 0);
// log("[DuolingoNextLesson] Total visible lessons: " + totalLessons);
// skills.filter( (skill, i, a) => i > 0 ? skill.row != a[i - 1].row : true ).map(skill => skill.targetCrownLevel)

/**
 * Removes obsolete "Start next lesson" button if such exists
 */
function removeObsoleteNextLessonButton() {
	var button = document.getElementById(K_NEXT_LESSON_BUTTON_ID);
	if (button != null) {
		exercise_button.removeChild(button);
	}
}

function createLessonButton(skill) {
	removeObsoleteNextLessonButton()

	// get any existing button to copy styling from
	var anyButton = document.querySelector("button");

	// prepare the next lesson button
	var button = document.createElement("button");
	button.id = K_NEXT_LESSON_BUTTON_ID;
	button.type = "button";
	button.textContent = "Start " + skill.shortName;
	button.onclick = function() {
		window.location.href = skillURL(skill);
	};
	button.className = anyButton.className;
	button.style = "width: auto;";

	// append button into place
	getPracticeAnchor().parentElement.appendChild(button);

}

function selectNextLesson(skill) {
	var skill_names = Array.prototype.slice.call(document.getElementsByClassName(K_SHORT_NAME));
	var next_skill = skill_names.filter(name => name.innerHTML == skill.shortName)[0].parentN(3);
	return next_skill;
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
	section.className = firstSection.className;
	subsection.className = getTreeSubsectionClass();
	firstSection.parentElement.insertBefore(section, firstSection);
	var rows = cracked_chunks.map(chunk => {
		var row = document.createElement("div");
		row.className = getRowClass();
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

function log(textToLog) {
	console.debug("[" + K_PLUGIN_NAME + "]: %o", textToLog);
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

function onChangeNextLesson(mutationsList) {

	/* Add a "NEXT LESSON" button when necessary */
	if (getDuoTree() != null) {
		if (document.getElementById(K_FIRST_SKILL_ITEM_ID) == null) {
			// log("New button required");
			getFirstSkill().id = K_FIRST_SKILL_ITEM_ID;

			readDuoState();
			var local_config = readConfig();
			var next_skill = updateCrownLevel(local_config);
			tagAllSkills();
			if (GM_getValue('create_exercise_button', K_CREATE_EXERCISE_BUTTON)) {
				createLessonButton(next_skill);
			}
			var selected_skill = selectNextLesson(next_skill);
			toDoNextSkills(selected_skill, GM_getValue('move_cracked_skills', K_MOVE_CRACKED_SKILLS));
			clickNextLesson(selected_skill);
		}
	}

}

new MutationObserver(onChangeNextLesson).observe(document.body, {
	childList: true,
	subtree: true
});

log("version " + GM_info.script.version + " ready");