---
name: kb-structure-management
title: KB Structure and Category Management
description: Manage the hierarchical category (folder) structure of a Knowledge Base, including creating nested folders, updating display/comments settings, and organizing index page blocks.
allowed-tools: engenty_tools_search engenty_tool_execute web_search
---

# KB Structure and Category Management

Use this skill when the user wants to organize, create, read, update, or delete categories (folders) within a Knowledge Base, or customize their view settings, comments policy, template bindings, or description.

## Target Knowledge Base Context

- **IMPORTANT**: Always verify the active or context Knowledge Base ID before performing any write operations. Do NOT blindly write to the tenant's default Knowledge Base if the user is currently looking at or referring to a specific Knowledge Base from the context.
- Use `kb_list` to list all available Knowledge Bases and match the name/slug/context of the active KB first.

---

## 1. Moving, Reordering, and Sorting Categories

To adjust how categories are structured and ordered, patch the category using `kb_category_update`:
- **Nesting/Hierarchy**: Update `parent_id` to the ID of another category to nest it, or set to `null` to make it a top-level category.
- **Manual Ordering**: Update `sort_order` (integer) to control the order relative to its siblings. Lower numbers float to the top/start.
- **View-Level Sidebar Sorting**: Inside the category settings, configure the sidebar sorting behavior for pages by patching the `page_settings.collection` object:
  - `sort_by`: Set to `"sort_order"`, `"name"`, `"created_at"`, or `"updated_at"`.
  - `max_items`: Customize the maximum number of items visible in the sidebar list (e.g. limit to 50).

---

## 2. Changing Category Settings

Use `kb_category_update` to manage and modify setting fields on an existing category:
- **View Type (Anzeigetyp)**:
  - `"folder"`: Pages and sub-categories appear as an expandable tree structure. Great for nested, manual structures.
  - `"collection"`: Pages appear as a flat, sortable list.
- **Comments Policy (`comments_mode`)**: Choose between `"inherit"`, `"none"`, `"enabled"`, or `"closed"`.
- **Template Bindings**: Inherit or bind specific article templates using `template_mode` (e.g., `"template"` or `"inherit"`) and `template_id`.
- **Category Cover & Propagation**:
  - `cover`: An object containing the cover configuration.
  - `cover_inheritance`: Controls how the cover is applied: `"none"` (only this page), `"direct_articles"` (only direct child pages), or `"all_children"` (this page and all sub-elements/nested pages).
- **Metadata**: Customize `description` (short string) or `icon` (emoji/icon key).

---

## 3. Moving Articles Between Categories

To move an article to a different category:
- Use `kb_article_update` with the `article_id`.
- Specify the target category's UUID as the `category_id` in the `patch` object:
  ```json
  {
    "article_id": "article-uuid",
    "patch": {
      "category_id": "target-category-uuid"
    }
  }
  ```
- **Note**: Always retrieve the target category's ID first (using `kb_categories_list` or by querying details) to ensure it belongs to the correct Knowledge Base.

---

## 4. Organizing Category / Folder Index Pages

Category and folder index pages (rendered at `/mdl/knowledge-base/kb/:kbSlug/c/:catSlug`) are highly customizable. You can control how sub-categories, articles, custom text blocks, and FAQs are organized by patching the `page_settings.blocks` array.

Each block in the `page_settings.blocks` array contains:
- `id`: Unique string (UUID).
- `type`: `"content"` | `"categories"` | `"articles"` | `"faqs"`.
- `visible`: Boolean.

### Block Types & Key Configuration:

1. **`type: "content"`** (Rich Text/HTML):
   - `content_markdown`: Markdown string to render custom introduction text, notices, or banners on the page.
2. **`type: "categories"`** (Sub-folders/Nested Categories):
   - `scope`: `"direct_children"` (only immediate child categories), `"direct_plus_one"` (immediate child categories plus their first level of nested children), or `"manual"` (explicitly list category IDs).
   - `style`: `"cards"` (large visual blocks) or `"list"` (sleek vertical tree).
   - `show_articles`: Boolean to toggle displaying child articles within each category card.
   - `category_count_display`: `"none"`, `"direct"`, or `"recursive"` (shows total nested article count).
3. **`type: "articles"`** (Article Listing):
   - `source`: Determine which articles to display:
     - `"direct_sorted"`: Normal list sorted by the folder's sort order.
     - `"latest_created"` / `"recent_updated"`: Chronologically sorted direct articles.
     - `"latest_created_recursive"` / `"recent_updated_recursive"`: Chronologically sorted articles from this category and all sub-categories.
     - `"manual_pick"`: Custom selection of article IDs.
   - `style`: `"cards"` or `"list"`.
   - `max_items`: Cap on the number of articles rendered in this block.
4. **`type: "faqs"`** (Frequently Asked Questions):
   - Displays a section of FAQs related to this category.
   - Configurable settings include `max_items` and `headline`.

---

## Operations Flow

1. Use `kb_categories_list` with the resolved `kb_id` to inspect the existing category tree and find parent IDs.
2. Use `kb_category_get` to retrieve a category's current settings.
3. Use `kb_category_create` to create a new category/folder. You can pass settings like `view_type`, `description`, `comments_mode`, `template_mode`, and `page_settings` directly upon creation.
4. Use `kb_category_update` to modify settings on an existing category.
5. Use `kb_category_delete` to remove a folder. Note that sibling/child articles under deleted categories are automatically re-parented to the default `"general"` category.
