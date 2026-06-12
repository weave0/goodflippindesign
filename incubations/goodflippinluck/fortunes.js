(function () {
  "use strict";

  var openers = [
    "May your next sunrise",
    "May this very week",
    "May your brave heart",
    "May your work and wonder",
    "May your small choices",
    "May your laughter"
  ];

  var middles = [
    "gather allies",
    "unlock hidden doors",
    "turn timing in your favor",
    "attract kind collaborators",
    "make room for joyful surprises",
    "carry momentum across seasons",
    "light up the right path",
    "steady your steps"
  ];

  var endings = [
    "with grace and good fortune.",
    "while protecting your peace.",
    "and leave luck for those you love.",
    "as opportunities find your name.",
    "in ways bigger than expected.",
    "without stealing your rest.",
    "and bring abundance to your home.",
    "with courage, clarity, and charm."
  ];

  var curated = [
    { text: "Fortune follows the one who keeps showing up with a kind face and a steady plan.", tier: "legendary" },
    { text: "A blessing is already walking toward you; your patience is the welcome mat.", tier: "epic" },
    { text: "The right door does not ask you to shrink. Walk through it at full height.", tier: "rare" },
    { text: "The luck you seek has your handwriting on it. Keep creating.", tier: "rare" },
    { text: "Today your courage compounds. Tomorrow your opportunities do too.", tier: "epic" },
    { text: "Your joy is not random. It is a compass to your next good decision.", tier: "uncommon" },
    { text: "A long-awaited yes is practicing your name right now.", tier: "legendary" },
    { text: "When you choose generosity, luck chooses your address.", tier: "rare" },
    { text: "Your next collaboration multiplies blessings, not stress.", tier: "uncommon" },
    { text: "The delay was a disguise. Better timing just arrived.", tier: "epic" },
    { text: "You are one brave conversation away from a season of relief.", tier: "rare" },
    { text: "Your name will be spoken in rooms that reward your integrity.", tier: "mythic" }
  ];

  function tierFromIndex(index) {
    if (index % 97 === 0) {
      return "mythic";
    }
    if (index % 41 === 0) {
      return "legendary";
    }
    if (index % 17 === 0) {
      return "epic";
    }
    if (index % 7 === 0) {
      return "rare";
    }
    if (index % 3 === 0) {
      return "uncommon";
    }
    return "common";
  }

  var generated = [];
  var id = 0;

  for (var i = 0; i < openers.length; i += 1) {
    for (var j = 0; j < middles.length; j += 1) {
      for (var k = 0; k < endings.length; k += 1) {
        id += 1;
        generated.push({
          text: openers[i] + " " + middles[j] + " " + endings[k],
          tier: tierFromIndex(id)
        });
      }
    }
  }

  var fullPool = curated.concat(generated);

  for (var p = 0; p < fullPool.length; p += 1) {
    fullPool[p].id = p + 1;
  }

  window.FORTUNE_POOL = fullPool;
})();
