// ==UserScript==
// @name        Duolingo Next Lesson
// @namespace   local
// @include     https://www.duolingo.com/*
// @author      Camilo
// @version     0.1
// @grant	none
// @downloadURL  https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// @updateURL  https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js
// ==/UserScript==


var duoState = JSON.parse(localStorage['duo.state'])

function isCurrentCourse(x)
{
	return x.learningLanguage === duoState.user.learningLanguage &&
		x.fromLanguage === duoState.user.fromLanguage
}

let skills = Object.values(duoState.skills).filter(isCurrentCourse)

let current_course = Object.values(duoState.courses).filter(isCurrentCourse)

let totalLessons = skills.map(x => x.lessons).reduce((a, b) => a + b, 0)

let course_keys = Object.keys(current_course[0].trackingProperties)

if (course_keys.includes("total_crowns")) {
	console.debug(course_keys)
} else {
	console.debug("No crowns for you yet")
}
