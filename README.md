# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).


有两个markdown文件，我想把它们都分别转成oldMdast，newMdast，拿oldMdast和newMdast做类似vue的diff算法对比（或者有其他更好的办法？）对比后合并这两个ast成一个新的mergedMdast，并给mergedMdast的节点做一些标记，如下：
1. 如果oldMdast中存在newMdast中不存在的节点，则在mergedMdast中给oldMdast的节点添加一个删除标记
2. 如果newMdast中存在oldMdast中不存在的节点，则在mergedMdast中给newMdast的节点添加一个新增标记
3. 如果oldMdast和newMdast中都存在节点且位置相同，但是节点内容不同，则在mergedMdast中合并这两个节点，合并后的内容为oldMdast的节点内容+newMdast的节点内容，合并后的节点添加一个diff标记, 并把合并后的内容给打开标记，标记出合并后的节点内容哪些是新增的，哪些是删除的，哪些是不变的
4. 如果oldMdast和newMdast中都存在节点且位置相同，但是节点内容相同，给oldMdast的节点添加一个不改变标记
根据mergedMdast的节点标记，给mergedMdast的节点添加不同的样式，如下：
1. 删除标记的节点添加一个删除样式
2. 新增标记的节点添加一个新增样式
3. diff标记的节点添加一个diff样式
4. 不改变标记的节点添加一个不改变样式
且在改变的节点中，可以hover有两个按钮，一个是接受按钮，一个是拒绝按钮
点击接受按钮，接受当前节点的改变
点击拒绝按钮，拒绝当前节点的改变