/* eslint-env node */

module.exports = async function(context, commands) {
  context.log.info("Starting a browsertime pageload");
  let url = context.options.browsertime.url;
  let page_cycles = context.options.browsertime.page_cycles;
  let page_cycle_delay = context.options.browsertime.page_cycle_delay;
  let foreground_delay = context.options.browsertime.foreground_delay;

  context.log.info("Waiting for %d ms (foreground_delay)", foreground_delay);
  await commands.wait.byTime(foreground_delay);

  context.log.info("Navigating to about:blank");
  await commands.navigate("about:blank");

  for (let count = 0; count < page_cycles; count++) {
    context.log.info("Cycle %d, waiting for %d ms", count, page_cycle_delay);
    await commands.wait.byTime(page_cycle_delay);
    context.log.info("Cycle %d, starting the measure", count);
    await commands.measure.start(url);
  }
  context.log.info("Browsertime pageload ended.");
  return true;
};
