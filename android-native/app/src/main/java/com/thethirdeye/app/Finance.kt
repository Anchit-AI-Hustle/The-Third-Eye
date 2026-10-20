package com.thethirdeye.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.Currency
import java.util.Locale

val expenseCategories = listOf("Food", "Groceries", "Transport", "Shopping", "Bills", "Health", "Entertainment", "Travel", "Other")

fun rupees(value: Double): String = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-IN")).apply {
    currency = Currency.getInstance("INR")
    maximumFractionDigits = 2
    minimumFractionDigits = if (value == Math.rint(value)) 0 else 2
}.format(value)

class FinanceModel : Records<Expense>("expenses") {
    override suspend fun fetch() = DataStore.rows<Expense>("expenses")

    /** This month's spending, as on the website's Finance page. */
    val thisMonth get() = today().take(7).let { month -> items.filter { it.spent_on.startsWith(month) } }
    val monthTotal get() = thisMonth.sumOf { it.amount }
    val byCategory get() = thisMonth.groupBy { it.category }.map { (k, v) -> k to v.sumOf { it.amount } }.sortedByDescending { it.second }

    suspend fun save(id: String?, amount: Double, category: String, note: String, date: String) = mutate {
        val row = buildJsonObject { put("amount", amount); put("category", category); put("note", note); put("spent_on", date) }
        if (id != null) DataStore.update("expenses", id, row)
        else DataStore.insert("expenses", buildJsonObject { row.forEach { (k, v) -> put(k, v) }; put("id", newId()) })
    }
}

@Composable
fun FinanceScreen(onBack: () -> Unit, model: FinanceModel = remember { FinanceModel() }) {
    val scope = rememberCoroutineScope()
    // null: closed; an expense with a blank id: a new one.
    var editing by remember { mutableStateOf<Expense?>(null) }
    LaunchedEffect(Unit) { model.load() }
    ReloadOnDataChange { model.load() }

    ListScreen("Finance", model.loaded, refresh = { model.load() }, onBack = onBack, actions = {
        IconButton(onClick = { editing = Expense(id = "", category = "Food", spent_on = today()) }) { Icon(Icons.Outlined.Add, contentDescription = "Add expense") }
    }) {
        item { ErrorText(model.error) }
        item {
            Panel {
                SectionLabel("This month")
                Text(rupees(model.monthTotal), fontSize = 30.sp, fontWeight = FontWeight.Bold)
                model.byCategory.forEach { (name, total) ->
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Row { Text(name, Modifier.weight(1f), fontSize = 13.sp); Text(rupees(total), fontSize = 13.sp, color = Palette.secondary) }
                        LinearProgressIndicator(
                            progress = { if (model.monthTotal > 0) (total / model.monthTotal).toFloat() else 0f },
                            Modifier.fillMaxWidth(), color = Palette.blue, trackColor = Palette.border,
                        )
                    }
                }
            }
        }
        item { SectionLabel("Expenses") }
        if (model.loaded && model.items.isEmpty()) item { Hint("No expenses yet. Tap + or tell the assistant \"I spent 250 on lunch\".") }
        model.items.forEach { e ->
            item(e.id) {
                Row(
                    Modifier.fillMaxWidth().background(Palette.surface.copy(alpha = 0.7f), RoundedCornerShape(12.dp)).clickable { editing = e }.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(e.note?.takeIf { it.isNotBlank() } ?: e.category, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                        Text("${e.category} · ${e.spent_on}", fontSize = 12.sp, color = Palette.muted)
                    }
                    Text(rupees(e.amount), fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    IconButton(onClick = { scope.launch { model.remove(e.id) { it.id } } }) { Icon(Icons.Outlined.Delete, contentDescription = "Delete", tint = Palette.muted) }
                }
            }
        }
    }

    editing?.let { e ->
        ExpenseEditor(e, onDismiss = { editing = null }) { amount, category, note, date ->
            editing = null
            scope.launch { model.save(e.id.ifBlank { null }, amount, category, note, date) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExpenseEditor(expense: Expense, onDismiss: () -> Unit, onSave: (Double, String, String, String) -> Unit) {
    var amount by remember { mutableStateOf(if (expense.id.isBlank()) "" else formatNumber(expense.amount)) }
    var category by remember { mutableStateOf(expense.category.takeIf { it in expenseCategories } ?: "Other") }
    var note by remember { mutableStateOf(expense.note ?: "") }
    var date by remember { mutableStateOf(expense.spent_on.ifBlank { today() }) }
    var picking by remember { mutableStateOf(false) }
    val value = amount.replace(",", "").toDoubleOrNull() ?: 0.0

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Palette.elevated,
        title = { Text("Expense") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(amount, { amount = it }, Modifier.fillMaxWidth(), label = { Text("Amount (₹)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                Choice("Category", expenseCategories, category) { category = it }
                OutlinedTextField(note, { note = it }, Modifier.fillMaxWidth(), label = { Text("What was it for?") }, singleLine = true)
                Row(verticalAlignment = Alignment.CenterVertically) { Text("Date", Modifier.weight(1f)); TextButton(onClick = { picking = true }) { Text(date) } }
            }
        },
        confirmButton = { TextButton(onClick = { onSave(value, category, note, date) }, enabled = value > 0) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )

    if (picking) {
        val state = rememberDatePickerState(initialSelectedDateMillis = LocalDate.parse(date).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { picked ->
                        val day = Instant.ofEpochMilli(picked).atZone(ZoneOffset.UTC).toLocalDate()
                        if (!day.isAfter(LocalDate.now())) date = day.format(dayFormat)
                    }
                    picking = false
                }) { Text("OK") }
            },
        ) { DatePicker(state) }
    }
}
