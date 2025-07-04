// ==UserScript==
// @name         北摩クエストリンク
// @namespace    https://wdrb.work/
// @version      1.0
// @description  arealist.csvをGitHubから取得し、エリア名やアイテム名を自動リンク化
// @match        https://wdrb.work/otherside/quest.php
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

const CSV_URL = 'https://raw.githubusercontent.com/Sinistella/42ste114/main/kitama/arealist.csv';

(function() {
    'use strict';

    GM_xmlhttpRequest({
        method: "GET",
        url: CSV_URL,
        onload: function(response) {
            const csvText = response.responseText;
            const areaData = csvText.split('\n').filter(x => x.trim());
            const wordUrlMap = {};

            areaData.forEach(line => {
                // a_id,エリア名,アイテム,アイテム... 形式で記述
                const [num, ...rest] = line.split(',');
                if (!num || rest.length === 0) return;
                const url = `https://wdrb.work/otherside/field.php?a_id=${num.trim()}&area_move=1`;
                // リンクが被った場合、csvの下の方が優先
                rest.forEach(word => {
                    wordUrlMap[word.trim()] = url;
                });
            });

            const questSection = document.querySelector('section#quest.container.class');
            if (!questSection) return;

            function linkifyNode(node, map) {
                if (node.nodeType === Node.TEXT_NODE) {
                    let replaced = node.nodeValue;
                    Object.keys(map).forEach(function(key) {
                        // 複数マッチ用
                        replaced = replaced.replace(new RegExp(key, 'g'), function(match) {
                            return `<a href="${map[key]}" target="_blank">${match}</a>`;
                        });
                    });
                    if (replaced !== node.nodeValue) {
                        const span = document.createElement('span');
                        span.innerHTML = replaced;
                        node.parentNode.replaceChild(span, node);
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE && node.childNodes) {
                    for (let i = 0; i < node.childNodes.length; i++) {
                        linkifyNode(node.childNodes[i], map);
                    }
                }
            }

            linkifyNode(questSection, wordUrlMap);
        }
    });
})();
