import { createContentLoader } from 'vitepress'

export interface Post {
  title: string
  url: string
  date: string
  author: string
  description: string
  lang: 'zh' | 'en'
}

declare const data: Post[]
export { data }

// Every blog post in both languages, newest first.
export default createContentLoader(['blog/posts/*.md', 'en/blog/posts/*.md'], {
  transform: (raw): Post[] => raw
    .map((p) => ({
      title: p.frontmatter.title,
      url: p.url,
      date: new Date(p.frontmatter.date).toISOString(),
      author: p.frontmatter.author,
      description: p.frontmatter.description,
      lang: p.url.startsWith('/en/') ? 'en' : 'zh',
    } as Post))
    .sort((a, b) => b.date.localeCompare(a.date)),
})
