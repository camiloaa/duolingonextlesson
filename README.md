DuolingoNextLesson
===========

If you have Tampermonkey/Greasemonkey/Violentmonkey installed you can [install the script by clicking on this link](https://github.com/camiloaa/duolingonextlesson/raw/master/DuolingoNextLesson.user.js)

## Configure

You can create your own per-course configuration using localStorage.
In this example, duo.nextlesson.es.en means Spanish for English speakers.
Adjust the name for the course you want to configure.
```
		local_config = {divider: 4, min:1, initial: 1, lineal: 0, sequential: true}
		localStorage.setItem('duo.nextlesson.es.en', JSON.stringify(local_config))
```
You can also change the global settings by modifying the code directly
**WARNING!!!** If you edit the script, you'll have to upgrade it manually

Example settings for (divider, min, initial, lineal):
-	(4, 1, 1, -1) : 10% of rows at level 5, 20% @ 4, 30% @ 3, 40% @ 2. (DEFAULT)
-	(4, 1, 1, 0)  : at least 25% of rows at level 5, at most 25% at level 4 and so on.
-	(3, 1, 0, 0)  : Same as before, but more lessons from new skills
-	(2, 1, 1, 0)  : 50% of finished rows at level 2, 50% at level 3.
-	(1, 1, 1, 0)  : All rows pointing to level 2 until the end of the tree.
-	(4, 2, 1, 0)  : Same as (1, 4, 1) but keep it slow until the first shortcut.
-	(4, 2, 1, 0)  : Same as (1, 4, 1) but keep it slow until the first shortcut.

