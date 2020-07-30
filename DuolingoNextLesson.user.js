// ==UserScript==
// @name        Duolingo Next Lesson
// @namespace   local
// @include     https://www.duolingo.com/learn
// @include     https://preview.duolingo.com/learn
// @author      Camilo Arboleda
// @version     1.3.0
// @description Add a "START LESSON" button in Duolingo. Check the README for more magic
// @copyright   2018+ Camilo Arboleda
// @license     https://github.com/camiloaa/duolingonextlesson/raw/master/LICENSE
// @grant       GM_getValue
// @grant       GM_setValue
// @downloadURL https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// @updateURL   https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// ==/UserScript==

// UI Constants
let K_DUOTREE = "nae5G";
let K_SMALL_SCREEN_BUTTON = "_1LLpj _3ZQ9H _18se6 vy3TL _3iIWE _1Mkpg _1Dtxl _1sVAI sweRn _1BWZU _1LIf4 QVrnU";
let K_SECTION = "f1yMM _24RGH";
let K_SUBSECTION = "_13Apa";
let K_ROW = "_29Bml";
let K_CRACKED = "_7WUMp";
let K_SHORT_NAME = "_1j18D";
let K_EXERCISE_BUTTON = "_1m9LW _1rwed";

let K_PLUGIN_NAME = "DuolingoNextLesson";

// Default setup
let K_MOVE_CRACKED_SKILLS = false;
let K_AUTO_SCROLL_TO_NEXT = false;
let K_CREATE_EXERCISE_BUTTON = true;
// Global variables. Here lives the devil
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


Array.prototype.randomElement = function () {
	return this[Math.floor(Math.random() * this.length)]
}

Element.prototype.parentN = function (n) {
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
	// log("S:" + skill.shortName + " " + index + " T:" + skill.targetCrownLevel + " W:" + skill.crownWeight);
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
	// log("Min step:" + min_step + " Max step:" + max_step)

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
	// log("Segment length: " + active_segment + " Step: " + active_step);

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
	// log("Max weight: " + max_weight);
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

function createLessonButton(skill) {
	var exercise_button = document.getElementsByClassName(K_EXERCISE_BUTTON)[0];

	// Mark the first element in the tree.
	// It might be incompatible with other scripts using a similar trick
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
	// log("No side panel");
	button.className = K_SMALL_SCREEN_BUTTON
		+ " duolingonextlesson";
	button.style = "visibility: visible;" +
		"border-left-width: 1px; ";
	exercise_button.appendChild(button);
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
	var firstsect = document.getElementsByClassName(K_SECTION)[0];
	section.className = K_SECTION + " duolingonextlesson";
	subsection.className = K_SUBSECTION + " duolingonextlesson";
	firstsect.parentElement.insertBefore(section, firstsect);
	var rows = cracked_chunks.map(chunk => {
		var row = document.createElement("div");
		row.className = K_ROW + " duolingonextlesson";
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
	// log("You need a new button");
	// Remove all old elements
	var to_remove = document.getElementsByClassName("duolingonextlesson");
	while (to_remove[0]) {
		to_remove[0].parentNode.removeChild(to_remove[0]);
	}
	document.getElementsByClassName(K_SHORT_NAME)[0].parentNode.id = "skill-tree-first-item";

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
	var duotree = document.getElementsByClassName(K_DUOTREE);

	/* Add a "NEXT LESSON" button when necessary */
	if (duotree.length != 0) {
		if (document.getElementById("skill-tree-first-item") == null) {
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
