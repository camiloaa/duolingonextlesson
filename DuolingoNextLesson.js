// ==UserScript==
// @name        Duolingo Next Lesson
// @namespace   local
// @include     https://www.duolingo.com/*
// @author      Camilo
// @version     0.2
// @grant	none
// @downloadURL  https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// @updateURL  https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// ==/UserScript==

// Configuration constants
let MIN_STEP = 1;	// Increase this value to advance faster in the course
					// A value of 1 requires having the first row of the tree
					// at level 5 before finishing the 5th row of the tree
					// A value of 2 would require that before row 10
					// A value of 3 before row 15 and so on.
					// Values under 1 are not defined

var duoState = {}
var course_skills = []
var skills = []
var current_course = {}
var tree = []
var course_keys = []
var next_skill = {}

function isCurrentCourse(x)
{
	return x.learningLanguage === duoState.user.learningLanguage &&
		x.fromLanguage === duoState.user.fromLanguage
}

function readDuoStatus() {
	duoState = JSON.parse(localStorage['duo.state'])
	course_skills = Object.values(duoState.skills).filter(isCurrentCourse)
	skills = course_skills.filter(skill => skill.accessible == true)
	current_course = Object.values(duoState.courses).filter(isCurrentCourse)[0]
	tree = current_course.skills.map(row => row.map (skill => {
		duoState.skills[skill].targetCrownLevel = 1
		return duoState.skills[skill]
	}))
	totalLessons = course_skills.map(x => x.lessons).reduce((a, b) => a + b, 0)
	course_keys = Object.keys(current_course.trackingProperties)
}

function updateCrownLevel() {
	// Find the last completed row
	var last_row = tree.length
	var unfinished_skills = skills.filter(skill =>
		skill.finishedLevels == 0)
	if (unfinished_skills) {
		last_row = unfinished_skills[0].row
	}

	course_skills.map(skill => skill.targetCrownLevel = 0)
	// Split the rows in 4 groups
	var level_step = Math.ceil(last_row / 4) * MIN_STEP
	// Increase targetCrownLevel for earlier skills
	for (i = last_row; i > -level_step; i -= level_step) {
		skills.filter(skill => skill.row <= Math.max(i, 0)).
			map(skill => ++skill.targetCrownLevel)
	}
	max_weight = skills.map(skill => skill.crownWeight =
			(1 - skill.finishedLessons/skill.lessons) *
			(skill.targetCrownLevel - skill.finishedLevels)).
			reduce( (acc,current) => acc = Math.max(acc,current), 0)
	next_skill = skills.filter(skill => skill.crownWeight == max_weight)[0]
}

function skillURL(skill) {
	return "https://www.duolingo.com/skill/" +
	skill.learningLanguage + "/" +
	skill.urlName + "/" +
	(1+skill.finishedLessons)
}

function createButton(skill) {

}

readDuoStatus()

if (course_keys.includes("total_crowns")) {
	updateCrownLevel()
} else {
	console.debug("No crowns for you yet")
	updateCrownLevel()
}
