// @flow

'use strict';

const exec = require('child_process').execSync;
const spawn = require('child_process').spawnSync;
const fs = require('fs');
const moment = require('moment');
const purify = require('purify-css');
const {
  loadTemplate,
  mergeDisjoint,
  renderTemplate,
  renderPostBody,
  renderPostPreview,
  getPostMarkdown,
} = require('./utils');

const postFullTemplate = loadTemplate('postFullTemplate');
const postShortTemplate = loadTemplate('postShortTemplate');
const listPageTemplate = loadTemplate('listPageTemplate');
const rssTemplate = loadTemplate('rssTemplate');

const skipRsync = process.argv.includes('--skip-rsync');
function run() {
  const posts = require('./posts.json').filter(p => p.published !== false);

  const options = {
    posts: posts,
    host: process.env.HOST || 'https://jamesfriend.com.au',
  };

  const partials = require('./partials')(options);

  spawn('mkdir -p ./build/');
  spawn('mkdir -p ./build/files');

  if (!skipRsync) {
    // sync static files
    spawn('rsync -r --delete  ./html/ ./build/');
  }

  // delete existing html files from root dir
  exec('file --mime-type --no-pad build/*')
    .toString()
    .split('\n')
    .map(line => line.split(': '))
    .filter(parts => parts[1] === 'text/html')
    .forEach(parts => exec(`rm ${parts[0]}`));

  // post full view pages
  posts.forEach(post => {
    const bodyHTML = renderPostBody(post);
    const page = renderTemplate(
      postFullTemplate,
      mergeDisjoint(partials, {
        post: mergeDisjoint(Object.assign(post, {body: bodyHTML}), {
          created_human: moment(post.created).format('MMMM D, YYYY'),
        }),
        meta_description: getPostMarkdown(post).slice(0, 300),
      })
    );
    fs.writeFileSync(`./build/${post.slug}`, page, {encoding: 'utf8'});
  });

  // post previews
  const postsShortTexts = [];
  posts.forEach(post => {
    const preview = renderPostPreview(post);

    const postShortText = renderTemplate(
      postShortTemplate,
      mergeDisjoint(partials, {
        post: mergeDisjoint(post, {
          created_human: moment(post.created).format('MMMM D, YYYY'),
          body_short: preview,
        }),
      })
    );
    postsShortTexts.push(postShortText);
  });

  // rss
  const rss = renderTemplate(
    rssTemplate,
    mergeDisjoint(partials, {
      posts: posts.map(post =>
        mergeDisjoint(post, {
          created_rss: moment(post.created).format(
            'ddd, DD MMM YYYY HH:mm:ss ZZ'
          ),
          body_short: renderPostPreview(post),
        })
      ),
    })
  );
  fs.writeFileSync(`./build/rss.xml`, rss, {encoding: 'utf8'});

  // front page
  const frontpage = renderTemplate(
    listPageTemplate,
    mergeDisjoint(partials, {
      views_rows: postsShortTexts.join('\n'),
    })
  );
  fs.writeFileSync(`./build/index.html`, frontpage, {encoding: 'utf8'});

  {
    const content = ['build/index.html', 'html/assets/main.js'].concat(
      posts.map(p => `build/${p.slug}`)
    );
    const css = ['./html/assets/main.css'];

    const options = {
      output: './build/assets/main.css',

      info: true,

      // Logs out removed selectors.
      rejected: true,
    };

    purify(content, css, options);
  }

  if (process.argv.includes('--publish')) {
    spawn(`./upload.sh`, {stdio: 'inherit'});
    const urlsToPurge = posts
      .map(p => `${options.host}/${p.slug}`)
      .concat([`${options.host}/`]);
    console.log('purging', urlsToPurge);
    spawn(`cfcli purge -d jamesfriend.com.au ${urlsToPurge.join(' ')}`);
  }
}

if (!module.parent) {
  run();
}
module.exports = run;
