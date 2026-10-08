<script setup lang="ts">
import type { KnowledgeTheme } from './knowledgePresentation'
defineProps<{ theme: KnowledgeTheme }>()
</script>

<template>
  <svg class="knowledge-art" :class="`knowledge-art--${theme}`" viewBox="0 0 180 170" fill="none" aria-hidden="true">
    <path d="M26 59C37 21 93 15 126 28S172 80 156 115C140 150 75 161 41 134S15 97 26 59Z" fill="currentColor" opacity=".12" />
    <g v-if="theme==='book'">
      <path d="M30 70Q58 60 89 79Q120 60 150 70V133Q120 124 89 144Q57 124 30 133Z" fill="#fffaf2" />
      <path d="M30 70Q58 60 89 79V144Q57 124 30 133Z" fill="currentColor" opacity=".24" />
      <path d="M89 78V141M43 88L72 96M43 101L72 110M107 96L135 87M107 110L135 101" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".7" />
      <path d="M90 69V35" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
      <path d="M91 54Q109 29 124 36Q123 60 91 60ZM89 46Q68 26 56 38Q65 57 89 54Z" fill="currentColor" opacity=".75" />
    </g>
    <g v-else-if="theme==='sun'">
      <circle cx="102" cy="66" r="29" fill="#efb96c" />
      <path d="M102 23V15M137 34L144 27M146 65H157M65 35L58 28M60 65H50" stroke="#cf9959" stroke-width="4" stroke-linecap="round" />
      <path d="M21 130Q66 77 116 108Q145 119 165 102V143H21Z" fill="currentColor" opacity=".28" />
      <path d="M20 143Q84 133 103 100Q130 92 163 117V149H20Z" fill="currentColor" opacity=".55" />
      <path d="M72 146Q112 134 109 107" stroke="#fff9ee" stroke-width="8" stroke-linecap="round" />
    </g>
    <g v-else-if="theme==='emotion'">
      <path d="M31 42Q31 29 45 29H107Q121 29 121 44V90Q121 103 107 103H66L45 120V103Q31 103 31 90Z" fill="currentColor" opacity=".32" />
      <path d="M73 77Q73 64 86 64H140Q153 64 153 79V117Q153 130 140 130H135V145L117 130H86Q73 130 73 117Z" fill="#fffaf4" />
      <circle cx="98" cy="93" r="3.5" fill="currentColor" /><circle cx="128" cy="93" r="3.5" fill="currentColor" />
      <path d="M101 108Q113 120 125 108" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
      <path d="M51 54H98M51 68H77" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".7" />
    </g>
    <g v-else-if="theme==='sleep'">
      <path d="M114 27A45 45 0 1 0 151 91A36 36 0 0 1 114 27Z" fill="#d9b877" />
      <path d="M24 127Q16 109 35 104Q37 79 59 86Q76 70 89 95Q112 92 113 112Q133 119 119 134H32Z" fill="#fffaf2" />
      <path d="M148 35L151 44L161 47L151 50L148 60L145 50L136 47L145 44Z" fill="currentColor" />
      <circle cx="56" cy="49" r="4" fill="currentColor" opacity=".5" />
      <path d="M42 116H81" stroke="currentColor" opacity=".25" stroke-width="4" stroke-linecap="round" />
    </g>
    <g v-else-if="theme==='move'">
      <circle cx="110" cy="42" r="14" fill="#e8b38c" />
      <path d="M97 61L78 90L105 103L122 130M83 94L62 128L38 132M87 69L69 65L52 83M95 66L119 84L140 76" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M20 149H158M30 56H54M22 73H38" stroke="currentColor" stroke-width="4" opacity=".3" stroke-linecap="round" />
    </g>
    <g v-else-if="theme==='course'">
      <rect x="28" y="43" width="125" height="85" rx="12" fill="currentColor" opacity=".55" />
      <rect x="36" y="51" width="109" height="66" rx="6" fill="#fffaf4" />
      <path d="M80 69L107 84L80 100Z" fill="currentColor" />
      <path d="M20 132H161L150 142H32Z" fill="currentColor" opacity=".85" />
      <circle cx="137" cy="26" r="8" fill="#eab679" />
    </g>
    <g v-else>
      <path d="M51 93V74A40 40 0 0 1 131 74V106" stroke="currentColor" stroke-width="10" stroke-linecap="round" />
      <rect x="37" y="79" width="26" height="42" rx="12" fill="currentColor" /><rect x="119" y="79" width="26" height="42" rx="12" fill="currentColor" />
      <path d="M132 119Q128 142 99 138" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
      <rect x="84" y="131" width="22" height="11" rx="5" fill="currentColor" />
      <path d="M90 103L72 86C58 70 79 56 90 73C102 56 122 70 108 86Z" fill="#e7aa96" />
    </g>
  </svg>
</template>

<style scoped>
.knowledge-art{display:block;width:100%;height:auto;color:#b3805e}.knowledge-art--sun{color:#8c9e83}.knowledge-art--emotion{color:#9b86b4}.knowledge-art--sleep{color:#8297b9}.knowledge-art--move{color:#739e99}.knowledge-art--course{color:#8293b1}.knowledge-art--support{color:#8599ab}
</style>
