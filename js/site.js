/* ==========================================
   Move Smart - site-wide behavior
   The phone menu, and friendly checking for the contact form.
   ========================================== */
(function () {
  'use strict';

  // ---------- phone menu ----------
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.menu-toggle');

  function setMenu(open) {
    header.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  if (header && toggle) {
    toggle.addEventListener('click', function () {
      setMenu(!header.classList.contains('menu-open'));
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && header.classList.contains('menu-open')) {
        setMenu(false);
        toggle.focus();
      }
    });
    Array.prototype.forEach.call(header.querySelectorAll('.site-nav a'), function (link) {
      link.addEventListener('click', function () { setMenu(false); });
    });
  }

  // ---------- contact form ----------
  var form = document.querySelector('.contact-form');
  if (!form) return;

  // JavaScript shows its own messages, so turn off the browser's pop-up ones
  form.noValidate = true;

  var checks = [
    {
      field: form.querySelector('#name'),
      message: function (value) { return value ? '' : 'Enter your full name.'; }
    },
    {
      field: form.querySelector('#email'),
      message: function (value) {
        if (!value) return 'Enter your email address.';
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : 'Enter an email address like you@example.com.';
      }
    }
  ];

  function showError(check, text) {
    var field = check.field;
    var id = field.id + '-error';
    var note = document.getElementById(id);
    if (!note) {
      note = document.createElement('p');
      note.id = id;
      note.className = 'field-error';
      field.insertAdjacentElement('afterend', note);
    }
    note.textContent = text;
    note.hidden = !text;
    field.setAttribute('aria-invalid', text ? 'true' : 'false');
    if (text) field.setAttribute('aria-describedby', id);
    else field.removeAttribute('aria-describedby');
  }

  function validate(check) {
    var text = check.message(check.field.value.trim());
    showError(check, text);
    return !text;
  }

  checks.forEach(function (check) {
    // check a field when you leave it, and clear the message as soon as it is fixed
    check.field.addEventListener('blur', function () {
      if (check.field.value.trim()) validate(check);
    });
    check.field.addEventListener('input', function () {
      if (check.field.getAttribute('aria-invalid') === 'true') validate(check);
    });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var firstProblem = null;
    checks.forEach(function (check) {
      if (!validate(check) && !firstProblem) firstProblem = check.field;
    });
    if (firstProblem) {
      firstProblem.focus();
      return;
    }

    var firstName = form.querySelector('#name').value.trim().split(/\s+/)[0];
    var done = document.createElement('div');
    done.className = 'form-success';
    done.setAttribute('tabindex', '-1');
    done.innerHTML = '<h2></h2><p>Move Smart is a student project, so messages from this form are not delivered yet. ' +
      'Thank you for trying it out.</p><button type="button" class="btn btn-outline">Write another message</button>';
    done.querySelector('h2').textContent = 'Thanks, ' + firstName + '!';
    done.querySelector('button').addEventListener('click', function () {
      form.reset();
      done.remove();
      form.hidden = false;
      form.querySelector('#name').focus();
    });
    form.hidden = true;
    form.insertAdjacentElement('afterend', done);
    done.focus();
  });
})();
