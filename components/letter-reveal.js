/* ---- letter-reveal: behavior ------------------------------------------------
   The split and the stagger from TutorialStep.vue: the title is broken into
   letters, each an inline block with its own animation delay. A modal card
   spaces letters at 0.06s; a pointer callout compresses to 0.015s per letter
   capped at 0.18s so short hints do not dawdle. Words are wrapped whole so
   the reveal never breaks a word across lines. holoLetters(el, {modal})
   splits el's text and returns a replay function. */
(function () {
  "use strict";

  function holoLetters(el, opts) {
    opts = opts || {};
    var text = el.getAttribute("data-letrev-text") || el.textContent;
    el.setAttribute("data-letrev-text", text);

    function build() {
      el.textContent = "";
      var words = text.split(" ");
      var i = 0;
      words.forEach(function (word, w) {
        var wordEl = document.createElement("span");
        wordEl.className = "letrev-word";
        for (var c = 0; c < word.length; c++) {
          var s = document.createElement("span");
          s.className = "letrev-letter";
          s.textContent = word[c];
          s.style.animationDelay = (opts.modal
            ? i * 0.06
            : Math.min(i * 0.015, 0.18)) + "s";
          wordEl.appendChild(s);
          i++;
        }
        el.appendChild(wordEl);
        if (w < words.length - 1) {
          el.appendChild(document.createTextNode(" "));
          i++;                       /* the space keeps its beat upstream */
        }
      });
    }
    build();
    return build;
  }

  window.holoLetters = holoLetters;
})();
