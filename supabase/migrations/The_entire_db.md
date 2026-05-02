## Table `admin_audit_log`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `actor_user_id` | `uuid` |  Nullable |
| `action` | `text` |  |
| `entity_type` | `text` |  |
| `entity_id` | `uuid` |  Nullable |
| `before_data` | `jsonb` |  Nullable |
| `after_data` | `jsonb` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `admin_users`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `user_id` | `uuid` | Primary |
| `role` | `text` |  |
| `created_at` | `timestamptz` |  |
| `created_by` | `uuid` |  Nullable |

## Table `node_restructure_requests`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `requester_user_id` | `uuid` |  Nullable |
| `target_node_id` | `uuid` |  Nullable |
| `proposal` | `jsonb` |  |
| `proposal_version` | `int4` |  |
| `message` | `text` |  Nullable |
| `status` | `text` |  |
| `reviewed_by` | `uuid` |  Nullable |
| `reviewed_at` | `timestamptz` |  Nullable |
| `denial_reason` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `profile_cards`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `position` | `int4` |  |
| `type` | `text` |  |
| `data` | `jsonb` |  |
| `created_at` | `timestamptz` |  |

## Table `profiles`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `first_name` | `text` |  Nullable |
| `last_name` | `text` |  Nullable |
| `username` | `text` |  Nullable Unique |
| `avatar_url` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `bio` | `text` |  Nullable |
| `country` | `text` |  Nullable |
| `city` | `text` |  Nullable |
| `primary_language` | `text` |  Nullable |
| `theme` | `text` |  |
| `notif_weekly_digest` | `bool` |  |
| `notif_qa_answers` | `bool` |  |
| `notif_proposal_updates` | `bool` |  |
| `skillcoin_balance` | `int4` |  |

## Table `skill_attribute_defs`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `skill_node_id` | `uuid` |  |
| `key` | `text` |  |
| `label` | `text` |  |
| `type` | `text` |  |
| `unit` | `text` |  Nullable |
| `required` | `bool` |  |
| `enum_values` | `_text` |  Nullable |
| `sort_order` | `int4` |  |
| `created_at` | `timestamptz` |  |

## Table `skill_learning_blocks`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `page_id` | `uuid` |  |
| `type` | `text` |  |
| `content` | `jsonb` |  |
| `sort_order` | `int4` |  |
| `created_by` | `uuid` |  Nullable |
| `updated_by` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `skill_learning_pages`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `skill_node_id` | `uuid` |  Unique |
| `status` | `text` |  |
| `created_by` | `uuid` |  Nullable |
| `updated_by` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `skill_learning_suggestions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `skill_node_id` | `uuid` |  |
| `submitted_by` | `uuid` |  |
| `proposed_blocks` | `jsonb` |  |
| `message` | `text` |  Nullable |
| `status` | `text` |  |
| `reviewed_by` | `uuid` |  Nullable |
| `reviewed_at` | `timestamptz` |  Nullable |
| `deny_reason` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `skill_node_parents`

Secondary parent relationships for skill nodes. The primary parent is still stored in skill_nodes.parent_id

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `child_node_id` | `uuid` |  |
| `parent_node_id` | `uuid` |  |
| `created_at` | `timestamptz` |  Nullable |

## Table `skill_nodes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `name` | `text` |  |
| `slug` | `text` |  |
| `parent_id` | `uuid` |  Nullable |
| `path` | `ltree` |  |
| `is_leaf` | `bool` |  |
| `created_at` | `timestamptz` |  |
| `image_url` | `text` |  Nullable |

## Table `skill_resources`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `skill_node_id` | `uuid` |  |
| `title` | `text` |  |
| `url` | `text` |  |
| `kind` | `text` |  |
| `created_at` | `timestamptz` |  |

## Table `skill_stats`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `skill_node_id` | `uuid` | Primary |
| `num_users` | `int8` |  |
| `num_teachers` | `int8` |  |
| `updated_at` | `timestamptz` |  |

## Table `skillcoin_transactions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `amount` | `int4` |  |
| `reason` | `text` |  |
| `reference_id` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `support_messages`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `sender_user_id` | `uuid` |  Nullable |
| `email` | `text` |  Nullable |
| `subject` | `text` |  |
| `body` | `text` |  |
| `status` | `text` |  |
| `handled_by` | `uuid` |  Nullable |
| `handled_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `teaching_offers`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `skill_node_id` | `uuid` |  |
| `mode` | `text` |  |
| `location` | `text` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `user_login_days`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `user_id` | `uuid` | Primary |
| `login_date` | `date` | Primary |

## Table `user_roles`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `user_id` | `uuid` | Primary |
| `role` | `text` | Primary |
| `granted_at` | `timestamptz` |  |

## Table `user_skill_attributes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `user_id` | `uuid` | Primary |
| `skill_node_id` | `uuid` | Primary |
| `attribute_def_id` | `uuid` | Primary |
| `value_json` | `jsonb` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `user_skill_notes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `user_id` | `uuid` | Primary |
| `skill_node_id` | `uuid` | Primary |
| `content` | `jsonb` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `user_skills`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `user_id` | `uuid` | Primary |
| `skill_node_id` | `uuid` | Primary |
| `started_at` | `date` |  Nullable |
| `level` | `text` |  Nullable |
| `is_teaching` | `bool` |  |
| `visibility` | `text` |  |
| `created_at` | `timestamptz` |  |
| `status` | `text` |  |
| `pinned` | `bool` |  |
| `last_opened_at` | `timestamptz` |  Nullable |

