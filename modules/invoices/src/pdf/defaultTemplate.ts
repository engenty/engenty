export const defaultInvoiceTemplateXml = `<Document>
  <Page size="A4" style="page">
    <View style="header">
      <Text style="title">Invoice {{ invoice.number }}</Text>
      <Text style="muted">Date: {{ invoice.date }}</Text>
      <Text style="muted">Due Date: {{ invoice.dueDate }}</Text>
    </View>

    <View style="section">
      <Text style="sectionTitle">Recipient</Text>
      <Text style="text">{{ invoice.recipientName }}</Text>
      <Text style="text">{{ invoice.recipientStreet }}</Text>
      <Text style="text">{{ invoice.recipientPostalCode }} {{ invoice.recipientCity }}</Text>
      <Text style="text">{{ invoice.recipientCountry }}</Text>
      <Text style="muted">Email: {{ invoice.recipientEmail }}</Text>
      <Text style="muted">Tax ID: {{ invoice.recipientTaxId }} VAT ID: {{ invoice.recipientVatId }}</Text>
    </View>

    <View style="section">
      <Text style="text">{{ invoice.introduction }}</Text>
    </View>

    <View style="section">
      <Text style="sectionTitle">Positions</Text>
      <Text style="text">{{ invoice.body }}</Text>
    </View>

    <View style="totals">
      <Text style="line">Net: {{ invoice.sumNettoFormatted }}</Text>
      <Text style="line">Tax: {{ invoice.taxFormatted }}</Text>
      <Text style="total">Total: {{ invoice.sumBruttoFormatted }}</Text>
    </View>

    <View style="section">
      <Text style="muted">{{ invoice.finalNotes }}</Text>
    </View>
  </Page>
</Document>`;
