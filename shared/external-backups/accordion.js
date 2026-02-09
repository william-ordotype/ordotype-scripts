function d() {
  document.querySelectorAll('[x-ordo-utils="accordion"]').forEach(function(accordion) {
    var questions = accordion.querySelectorAll('[data-accordion-elem="question"]');
    var answers = accordion.querySelectorAll('[data-accordion-elem="answer"]');
    // Hide all answers initially
    answers.forEach(function(a) {
      a.style.display = "none";
      a.style.overflow = "hidden";
    });

    questions.forEach(function(question) {
      question.addEventListener("click", function() {
        var answer = question.nextElementSibling;
        var icon = question.querySelector('[data-accordion-elem="icon"]');
        var isOpen = question.classList.contains("open");

        // Close all other accordions
        questions.forEach(function(q) {
          if (q !== question) {
            q.classList.remove("open");
            var otherAnswer = q.nextElementSibling;
            var otherIcon = q.querySelector('[data-accordion-elem="icon"]');
            if (otherAnswer) {
              otherAnswer.style.transition = "height 0.3s ease";
              otherAnswer.style.height = otherAnswer.scrollHeight + "px";
              requestAnimationFrame(function() {
                otherAnswer.style.height = "0px";
              });
              setTimeout(function() {
                otherAnswer.style.display = "none";
                otherAnswer.style.height = "";
              }, 300);
            }
            if (otherIcon) {
              otherIcon.style.transform = "rotate(0deg)";
              otherIcon.style.display = "inline-block";
              otherIcon.style.transition = "all 0.3s ease";
            }
          }
        });

        // Toggle current accordion
        if (isOpen) {
          question.classList.remove("open");
          if (answer) {
            answer.style.transition = "height 0.3s ease";
            answer.style.height = answer.scrollHeight + "px";
            requestAnimationFrame(function() {
              answer.style.height = "0px";
            });
            setTimeout(function() {
              answer.style.display = "none";
              answer.style.height = "";
            }, 300);
          }
          if (icon) {
            icon.style.transform = "rotate(0deg)";
            icon.style.display = "inline-block";
            icon.style.transition = "all 0.3s ease";
          }
        } else {
          question.classList.add("open");
          if (answer) {
            answer.style.display = "block";
            var targetHeight = answer.scrollHeight;
            answer.style.height = "0px";
            answer.style.transition = "height 0.3s ease";
            requestAnimationFrame(function() {
              answer.style.height = targetHeight + "px";
            });
            setTimeout(function() {
              answer.style.height = "";
            }, 300);
          }
          if (icon) {
            icon.style.transform = "rotate(90deg)";
            icon.style.display = "inline-block";
            icon.style.transition = "all 0.3s ease";
          }
        }
      });
    });
  });
}
d();
