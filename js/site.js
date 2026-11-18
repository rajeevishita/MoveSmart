/* ==========================================
   Move Smart - site-wide behavior
   Light and dark mode, the phone menu, and friendly checking for the
   contact form.
   ========================================== */
(function () {
  'use strict';

  // ---------- light and dark mode ----------
  // The page already picked a theme in the <head> (your saved choice, or your
  // device setting). This button switches it and remembers the choice.
  var root = document.documentElement;
  var themeButton = document.querySelector('.theme-toggle');
  var THEME_KEY = 'movesmart-theme';

  function savedTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    if (themeButton) {
      themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
      themeButton.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    }
  }

  setTheme(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  if (themeButton) {
    themeButton.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      setTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode: still works for this page */ }
    });
  }

  // if you never pressed the button, follow your device when it switches
  if (window.matchMedia) {
    var system = window.matchMedia('(prefers-color-scheme: dark)');
    var follow = function (e) {
      var saved = savedTheme();
      if (saved !== 'light' && saved !== 'dark') setTheme(e.matches ? 'dark' : 'light');
    };
    if (system.addEventListener) system.addEventListener('change', follow);
    else if (system.addListener) system.addListener(follow);
  }

  // ---------- light on the glass ----------
  // With a mouse or trackpad, a soft highlight follows the pointer across the
  // glass panels, like light catching real glass.
  var GLASS = '.site-header .header-bar, .tips, .note-card, .contact-form, .faq details, ' +
              '.live-panel, .practice-panel, .form-success, .spec-list, .table-wrap';
  if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var lit = null, frame = 0, lastMove = null;
    document.addEventListener('pointermove', function (e) {
      lastMove = e;
      if (frame) return;
      frame = window.requestAnimationFrame(function () {
        frame = 0;
        var target = lastMove.target;
        var glass = target && target.closest ? target.closest(GLASS) : null;
        if (lit && lit !== glass) lit.classList.remove('glass-lit');
        lit = glass;
        if (!glass) return;
        var box = glass.getBoundingClientRect();
        glass.style.setProperty('--mx', Math.round(lastMove.clientX - box.left) + 'px');
        glass.style.setProperty('--my', Math.round(lastMove.clientY - box.top) + 'px');
        glass.classList.add('glass-lit');
      });
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () {
      if (lit) lit.classList.remove('glass-lit');
      lit = null;
    });
  }

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
