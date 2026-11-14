// Design vor dem ersten Zeichnen setzen, damit die Seite nicht kurz hell aufblitzt.
// Klassisches Skript (kein Modul), wird im <head> eingebunden.
try {
  var theme = localStorage.getItem('wordle-de:theme');
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
      meta.content = theme === 'dark' ? '#221921' : '#fff8f0';
    });
  }
  if (localStorage.getItem('wordle-de:contrast') === '1') document.documentElement.dataset.contrast = 'high';
} catch (e) {}
