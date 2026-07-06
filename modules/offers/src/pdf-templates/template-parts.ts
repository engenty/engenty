/**
 * Composed offer PDF template parts (engency-style).
 * Table: Pos, Bezeichnung, Menge, Preis, USt., Summe
 */

const tableHeaderBlock = `
              <View style="tableRow">
                <Text style="posColHeader">Pos</Text>
                <Text style="bezeichnungColHeader">Beschreibung</Text>
                <Text style="mengeColHeader">Menge / Einheit</Text>
                <Text style="preisColHeader">Einzelpreis</Text>
                {% if config.show_tax_per_item %}
                  <Text style="ustColHeader">USt.</Text>
                {% endif %}
                <Text style="summeColHeader">Gesamt</Text>
              </View>
`;

const lineItemStandardRow = `
                      <View style="tableRow">
                        <Text style="posCol posColMuted">{{ item.position }}</Text>
                        <View style="bezeichnungCol">
                          <Text style="cellTextBold">{{ item.title }}</Text>
                          {% if item.content %}
                            <View style="cellContentMuted">{{ item.content }}</View>
                          {% endif %}
                        </View>
                        <Text style="mengeCol">{{ item.amount }} {{ item.unit_display | default: item.unit }}</Text>
                        <Text style="preisCol">{{ item.cost_per_item_formatted }}</Text>
                        {% if config.show_tax_per_item %}
                          <Text style="ustCol">{{ item.tax_formatted }}</Text>
                        {% endif %}
                        <Text style="summeCol">{{ item.total_formatted }}</Text>
                      </View>
`;

const lineItemFixedRow = `
                      <View style="tableRow">
                        <Text style="posCol posColMuted">{{ item.position }}</Text>
                        <View style="bezeichnungCol">
                          <Text style="cellTextBold">{{ item.title }}</Text>
                          {% if item.content %}
                            <View style="cellContentMuted">{{ item.content }}</View>
                          {% endif %}
                        </View>
                        <Text style="mengeCol">pauschal</Text>
                        <Text style="preisCol"></Text>
                        {% if config.show_tax_per_item %}
                          <Text style="ustCol">{{ item.tax_formatted }}</Text>
                        {% endif %}
                        <Text style="summeCol">{{ item.total_formatted }}</Text>
                      </View>
`;

const lineItemTextRow = `
                      <View style="tableRow">
                        <Text style="posCol"></Text>
                        <View style="bezeichnungCol">
                          {% if item.content %}{{ item.content }}{% endif %}
                        </View>
                        <Text style="mengeCol"></Text>
                        <Text style="preisCol"></Text>
                        {% if config.show_tax_per_item %}
                          <Text style="ustCol"></Text>
                        {% endif %}
                        <Text style="summeCol"></Text>
                      </View>
`;

const lineItemHeadlineRow = `
                      <View style="tableRow">
                        <Text style="posCol posColMuted">{{ item.position }}</Text>
                        <View style="bezeichnungCol">
                          <Text style="cellTextBold">{{ item.title }}</Text>
                        </View>
                        <Text style="mengeCol"></Text>
                        <Text style="preisCol"></Text>
                        {% if config.show_tax_per_item %}
                          <Text style="ustCol"></Text>
                        {% endif %}
                        <Text style="summeCol"></Text>
                      </View>
`;

const lineItemPageBreakRow = `<View break="true" style="pageBreak" />`;

const bundleHeadingRowBlock = `
                  <View style="tableRow">
                    <Text style="posCol posColMuted">{{ entry.bundle.position }}</Text>
                    <View style="bezeichnungCol">
                      <Text style="cellTextSemibold">{{ entry.bundle.title | default: "" }}</Text>
                      {% if entry.bundle.content %}
                        <View style="cellContentMuted">{{ entry.bundle.content }}</View>
                      {% endif %}
                    </View>
                    <Text style="mengeCol"></Text>
                    <Text style="preisCol"></Text>
                    {% if config.show_tax_per_item %}
                      <Text style="ustCol"></Text>
                    {% endif %}
                    <Text style="summeCol"></Text>
                  </View>
`;

// NOTE: the styles engine resolves names against the stylesheet map only —
// tailwind-style utility strings are silently dropped, so these rows use the
// named subtotalRow/subtotalLabel/subtotalValue styles.
const blockSubtotalRow = `
              {% if block.subtotal > 0 %}
                {% assign showBlockSubtotal = true %}
                {% if group.type == "phase" and config.show_phase_subtotals and block.subtotal == group.subtotal %}
                  {% assign showBlockSubtotal = false %}
                {% endif %}
                {% if showBlockSubtotal %}
                  <View style="subtotalRow">
                    <Text style="subtotalLabel">Zwischensumme</Text>
                    <Text style="subtotalValue">{{ block.subtotal_formatted }}</Text>
                  </View>
                {% endif %}
              {% endif %}
`;

const phaseSubtotalRow = `
        {% if group.type == "phase" and config.show_phase_subtotals and group.subtotal > 0 %}
          <View style="subtotalRow">
            <Text style="subtotalLabel">Phasen-Zwischensumme</Text>
            <Text style="subtotalValue">{{ group.subtotal_formatted }}</Text>
          </View>
        {% endif %}
`;

const contentBlock = `
    {% if content %}
      {% for group in content %}
        {% if forloop.index > 1 %}
          <View break="true"></View>
        {% endif %}
        {% if group.type == "phase" and group.phase %}
          <View style="mt-6 mb-3">
            <Text style="sectionTitle">{{ group.phase.title }}</Text>
            {% if group.phase.content %}
              <View style="mb-2 bodyText">{{ group.phase.content }}</View>
            {% endif %}
          </View>
        {% endif %}

        {% for section in group.sections %}
          {% if section.title %}
            <View style="mt-4 mb-2">
              <Text style="subSectionTitle">{{ section.title }}</Text>
            </View>
          {% endif %}

          {% for contentBlock in section.content %}
            {% if contentBlock.type == "text" and contentBlock.content %}
              <View style="mb-2.5 bodyText">{{ contentBlock.content }}</View>
            {% endif %}
          {% endfor %}

          {% for block in section.blocks %}
            {% if block.title %}
              <View style="mt-3 mb-1">
                <Text style="bundleTitle">{{ block.title }}</Text>
              </View>
            {% endif %}
            {% if block.content %}
              <View style="mb-2.5 bodyText">{{ block.content }}</View>
            {% endif %}

            {% assign entries_count = block.entries | size %}
            {% if entries_count > 0 %}
              ${tableHeaderBlock}

              {% for entry in block.entries %}
                {% if entry.type == "bundle" %}
                  ${bundleHeadingRowBlock}

                  {% for item in entry.bundle.items %}
                    {% if item.line_item_subtype == "page_break" %}
                      ${lineItemPageBreakRow}
                    {% elsif item.line_item_subtype == "headline" %}
                      ${lineItemHeadlineRow}
                    {% elsif item.line_item_subtype == "text" or item.unit == "text" %}
                      ${lineItemTextRow}
                    {% elsif item.unit == "fixed" %}
                      ${lineItemFixedRow}
                    {% else %}
                      ${lineItemStandardRow}
                    {% endif %}
                  {% endfor %}
                {% endif %}

                {% if entry.type == "item" %}
                  {% assign item = entry.item %}
                  {% if item.line_item_subtype == "page_break" %}
                    ${lineItemPageBreakRow}
                  {% elsif item.line_item_subtype == "headline" %}
                    ${lineItemHeadlineRow}
                  {% elsif item.line_item_subtype == "text" or item.unit == "text" %}
                    ${lineItemTextRow}
                  {% elsif item.unit == "fixed" %}
                    ${lineItemFixedRow}
                  {% else %}
                    ${lineItemStandardRow}
                  {% endif %}
                {% endif %}
              {% endfor %}

              ${blockSubtotalRow}
            {% endif %}
          {% endfor %}

          ${phaseSubtotalRow}
        {% endfor %}
      {% endfor %}
    {% endif %}
`;

export const offerContentBlock = contentBlock;
