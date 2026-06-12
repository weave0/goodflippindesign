(function () {
  "use strict";

  var moodButton = document.getElementById("shuffleScene");
  var dispatchText = document.getElementById("dispatchText");

  if (!moodButton || !dispatchText) {
    return;
  }

  var moods = [
    "Warm and determined. You can feel the streetlights cheering for everyone.",
    "Playful and focused. DJ Z is spinning low-volume lo-fi while facts get double-checked.",
    "Courageous and cozy. Heavy Moose brought giant tea mugs and impossible optimism.",
    "Focused and electric. Shariff just rewrote a headline so it ends in possibility.",
    "Tender and triumphant. The newsroom cats just approved the kindness section."
  ];

  moodButton.addEventListener("click", function () {
    var pick = moods[Math.floor(Math.random() * moods.length)];
    dispatchText.textContent = pick;
  });
})();
