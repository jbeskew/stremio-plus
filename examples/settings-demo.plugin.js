// ==Plugin==
// @name         Settings Demo
// @version      1.0.0
// @author       Stremio Plus
// @description  Demo of the settings form, dialogs and error tracking. Copy into plugins/ to try it.
// @permission   dom
// @setting      enabled    | toggle | Enable demo         | true  | Shows an alert when you save
// @setting      greeting   | text   | Greeting            | Hello | Used in the alert
// @setting      accent     | color  | Accent colour       | #7b5bf5
// @setting      opacity    | range  | Opacity             | 0.8   | Just a slider | 0 | 1 | 0.05
// @setting      quality    | select | Quality             | auto  | auto,1080p,720p,480p | Just a dropdown
// @setting      throwLater | toggle | Throw an error 2 s after load | false | Exercises the error badge in the panel
// ==/Plugin==
(async () => {
  const api = StremioEnhancedAPI;
  const keys = ['enabled', 'greeting', 'accent', 'opacity', 'quality', 'throwLater'];
  const s = {};
  for (const k of keys) s[k] = await api.getSetting(k); // saved value, or the @setting default
  api.logger.info('loaded with ' + JSON.stringify(s));

  api.onSettingsSaved(async (v) => {
    api.logger.info('saved ' + JSON.stringify(v));
    if (!v.enabled) return;
    const i = await api.showAlert('info', 'Settings Demo', v.greeting + '!\nQuality: ' + v.quality, ['OK', 'Cancel']);
    api.logger.info('alert button index: ' + i);
  });

  if (s.throwLater) setTimeout(() => { throw new Error('Settings Demo: intentional error'); }, 2000);
})();
