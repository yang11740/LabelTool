from __future__ import annotations

# 我们加入这个库为了排查错误
import traceback
from loguru import logger

import re
from typing import cast
from typing import Any

from loguru import logger
from PyQt5 import QtCore
from PyQt5 import QtGui
from PyQt5 import QtWidgets

import labelme.utils

# TODO(unknown):
# - Calculate optimal position so as not to go out of screen area.


# 这是我们增加的Type下拉框逻辑
class LabelQComboBox(QtWidgets.QComboBox):
    # 设计一个下拉框 用来选取节点的Type
    def text(self):
        return self.currentText()

    def setText(self, text):
        self.setCurrentText(text)

    def setSelection(self, start, length):
        pass  # 下拉框不需要光标选中功能，直接 pass

    def setCompleter(self, completer):
        pass  # 下拉框自带补全，屏蔽原版的 completer

    def set_list_widget(self, list_widget):
        pass


class LabelQLineEdit(QtWidgets.QLineEdit):
    def set_list_widget(self, list_widget: QtWidgets.QListWidget) -> None:
        self.list_widget = list_widget

    def keyPressEvent(self, a0: QtGui.QKeyEvent) -> None:
        if a0.key() in [QtCore.Qt.Key_Up, QtCore.Qt.Key_Down]:
            self.list_widget.keyPressEvent(a0)
        else:
            super().keyPressEvent(a0)


class LabelDialog(QtWidgets.QDialog):
    def __init__(
        self,
        text: str = "Enter object label",
        parent: QtWidgets.QWidget | None = None,
        labels: list[str] | None = None,
        sort_labels: bool = True,
        show_text_field: bool = True,
        completion: str = "startswith",
        fit_to_content: dict[str, bool] | None = None,
        flags: dict[str, list[str]] | None = None,
    ) -> None:
        if fit_to_content is None:
            fit_to_content = {"row": False, "column": True}
        self._fit_to_content = fit_to_content

        super().__init__(parent)
        self.setWindowTitle("手稿节点属性配置")
        # 原有的基础控件（NodeType&GroupID）
        # self.edit = LabelQLineEdit() # 这是原本的节点初始化 手动填
        # 我们这里用下拉框进行选择
        self.edit = LabelQComboBox()
        self.edit.setEditable(True)  # 允许模糊搜索

        self.edit.lineEdit().setPlaceholderText(text)

        # 加入所有需要的文本节点类型
        node_types = [
            "MAIN_TEXT",
            "INTERLINEAR_ANNOTATION",
            "SIDE_MARGINALIA",
            "ADD_TEXT",
            "DELETE_TEXT",
            "SYMBOL_PLACEHOLDER",
            "SALUTATION",
            "INCEPTION",
            "WISH_CLOSING",
            "SIGNATURE",
            "DATE_LINE",
            "COLUMN_SEPARATOR",
            "INK_BLOT",
            "PUNCTUATION_MARK",
            "EDIT_MARK:insertion_mark",
            "EDIT_MARK:inversion_mark",
            "EDIT_MARK:deletion_line",
            "EDIT_MARK:comment_mark",
            "PREPRINTED_TEXT",
            "RED_SEAL_STAMP",
        ]
        self.edit.addItems([""] + node_types)  # 第一个留空

        # self.edit.setPlaceholderText(text)
        # self.edit.setValidator(labelme.utils.label_validator())
        # self.edit.editingFinished.connect(self._on_editing_finished)
        if flags:
            # self.edit.textChanged.connect(self._on_text_changed)
            # 换成我们的box版本
            self.edit.currentTextChanged.connect(self._on_text_changed)
        self.edit_group_id = QtWidgets.QLineEdit()
        self.edit_group_id.setPlaceholderText("输入数字，如: 1")
        self.edit_group_id.setValidator(
            QtGui.QRegExpValidator(QtCore.QRegExp(r"\d*"), None)
        )

        # 我们需要的特殊控件
        # 1. Node ID
        self.edit_node_id = QtWidgets.QLineEdit()
        self.edit_node_id.setPlaceholderText("Node ID (如: n_main_1)")

        # 2. Transcription (转写内容) — 双轨制：视觉忠实层 + 语义校勘层
        self.edit_transcription_raw = QtWidgets.QTextEdit()
        self.edit_transcription_raw.setPlaceholderText(
            "视觉忠实层 — 逐字转录原文 (Raw)"
        )
        self.edit_transcription_raw.setFixedHeight(50)

        self.edit_transcription_semantic = QtWidgets.QTextEdit()
        self.edit_transcription_semantic.setPlaceholderText(
            "语义校勘层 — 规范化/校勘后文本 (Semantic)"
        )
        self.edit_transcription_semantic.setFixedHeight(50)

        # 3. Z-Index (图层深度)
        self.combo_z_index = QtWidgets.QComboBox()
        self.combo_z_index.addItems(
            [
                "0 - 纸张/界格线",
                "1 - 正文/夹注",
                "2 - 批注/标点",
                "3 - 增补/涂改",
                "4 - 印章/墨渍",
            ]
        )

        # 4. Color (颜色)
        self.combo_color = QtWidgets.QComboBox()
        self.combo_color.addItems(["black", "red", "other"])

        # 4b. Vague (无法辨识)
        self.check_vague = QtWidgets.QCheckBox("Vague (无法辨识)")

        # 4c. Reading Direction (阅读序)
        self.combo_reading_direction = QtWidgets.QComboBox()
        self.combo_reading_direction.addItems(["RTL", "LTR"])

        # 4d. Handwriting Style (书写风格)
        self.edit_handwriting_style = QtWidgets.QLineEdit()
        self.edit_handwriting_style.setPlaceholderText("书写风格 (如: xingshu)")

        # 5. Edges (单条逻辑边快速配置，复杂情况建议后期或二次开发列表)
        self.edit_target_id = QtWidgets.QLineEdit()
        self.edit_target_id.setPlaceholderText("目标 Node ID")
        self.combo_relation = QtWidgets.QComboBox()
        self.combo_relation.addItems(
            [
                "",  # 默认无边
                "READS_AFTER",
                "ANNOTATES",
                "INSERTS_AT",
                "REPLACES",
                "OVERLAPS",
                "REPRESENTS",
            ]
        )
        # 组装配件
        layout = QtWidgets.QVBoxLayout()
        # 第一行：NodeType和GroupID
        if show_text_field:
            layout_edit = QtWidgets.QHBoxLayout()
            layout_edit.addWidget(QtWidgets.QLabel("节点类型(Type):"))
            layout_edit.addWidget(self.edit, 6)
            layout_edit.addWidget(QtWidgets.QLabel("所属组(Group ID):"))
            layout_edit.addWidget(self.edit_group_id, 2)
            layout.addLayout(layout_edit)
        # 第二行：NodeID和 快捷属性下拉
        layout_attr = QtWidgets.QHBoxLayout()
        layout_attr.addWidget(QtWidgets.QLabel("节点 ID:"))
        layout_attr.addWidget(self.edit_node_id, 4)
        layout_attr.addWidget(QtWidgets.QLabel("图层(Z):"))
        layout_attr.addWidget(self.combo_z_index, 3)
        layout_attr.addWidget(QtWidgets.QLabel("颜色(Color):"))
        layout_attr.addWidget(self.combo_color, 2)
        layout.addLayout(layout_attr)
        # 第二行半：扩展属性 (Vague / Reading Direction / Handwriting Style)
        layout_attr2 = QtWidgets.QHBoxLayout()
        layout_attr2.addWidget(self.check_vague)
        layout_attr2.addWidget(QtWidgets.QLabel("阅读序:"))
        layout_attr2.addWidget(self.combo_reading_direction, 1)
        layout_attr2.addWidget(QtWidgets.QLabel("书写风格:"))
        layout_attr2.addWidget(self.edit_handwriting_style, 2)
        layout.addLayout(layout_attr2)
        # 第三行：转写文本 — 双轨制
        layout.addWidget(QtWidgets.QLabel("视觉忠实层 (Raw):"))
        layout.addWidget(self.edit_transcription_raw)
        layout.addWidget(QtWidgets.QLabel("语义校勘层 (Semantic):"))
        layout.addWidget(self.edit_transcription_semantic)
        # 第四行：逻辑边配置(表格)
        layout_edge_header = QtWidgets.QHBoxLayout()
        layout_edge_header.addWidget(QtWidgets.QLabel("逻辑边配置 (Edges):"))
        self.btn_add_edge = QtWidgets.QPushButton("➕ 添加一条关系边")
        self.btn_add_edge.clicked.connect(lambda: self._add_edge_row())
        layout_edge_header.addWidget(self.btn_add_edge)
        layout.addLayout(layout_edge_header)
        # 创建一个 3 列的表格(第3列为删除按钮)
        self.edges_table = QtWidgets.QTableWidget(0, 3)
        self.edges_table.setHorizontalHeaderLabels(
            ["目标 Node ID", "关系类型(Relation)", "操作"]
        )
        self.edges_table.horizontalHeader().setStretchLastSection(True)
        self.edges_table.setColumnWidth(0, 130)
        self.edges_table.setColumnWidth(1, 160)
        self.edges_table.setFixedHeight(120)
        # 明确编辑触发方式：双击或按 F2/Enter 才进入编辑，避免单击误触导致焦点冲突
        self.edges_table.setEditTriggers(
            QtWidgets.QAbstractItemView.DoubleClicked
            | QtWidgets.QAbstractItemView.EditKeyPressed
        )
        layout.addWidget(self.edges_table)

        # label_list 候选列表
        self.label_list = QtWidgets.QListWidget()
        if self._fit_to_content["row"]:
            self.label_list.setHorizontalScrollBarPolicy(QtCore.Qt.ScrollBarAlwaysOff)
        if self._fit_to_content["column"]:
            self.label_list.setVerticalScrollBarPolicy(QtCore.Qt.ScrollBarAlwaysOff)
        self._sort_labels = sort_labels
        if labels:
            self.label_list.addItems(labels)
        if self._sort_labels:
            self.label_list.sortItems()
        else:
            self.label_list.setDragDropMode(QtWidgets.QAbstractItemView.InternalMove)
        self.label_list.currentItemChanged.connect(self._on_label_selected)
        self.label_list.itemDoubleClicked.connect(self._on_label_double_clicked)
        # self.label_list.setFixedHeight(150)
        self.label_list.setFixedHeight(120)
        self.edit.set_list_widget(self.label_list)
        layout.addWidget(QtWidgets.QLabel("推荐节点类型:"))
        layout.addWidget(self.label_list)

        if flags is None:
            flags = {}
        self._flags = flags
        self._flags_layout = QtWidgets.QVBoxLayout()
        self._reset_flags()
        layout.addItem(self._flags_layout)

        # text edit 原有的description部分 这里可做为备注
        self.edit_description = QtWidgets.QTextEdit()
        # self.edit_description.setPlaceholderText("Label description")
        # self.edit_description.setFixedHeight(50)
        self.edit_description.setPlaceholderText("额外备注(Description)")
        self.edit_description.setFixedHeight(40)
        layout.addWidget(self.edit_description)

        # buttons
        bb = QtWidgets.QDialogButtonBox(
            QtWidgets.QDialogButtonBox.Ok | QtWidgets.QDialogButtonBox.Cancel,
            QtCore.Qt.Horizontal,
            self,
        )
        bb.accepted.connect(self._validate)
        bb.rejected.connect(self.reject)
        layout.addWidget(bb)

        self.setLayout(layout)

        # completion
        completer = QtWidgets.QCompleter()
        if completion == "startswith":
            completer.setCompletionMode(QtWidgets.QCompleter.InlineCompletion)
            # Default settings.
            # completer.setFilterMode(QtCore.Qt.MatchStartsWith)
        elif completion == "contains":
            completer.setCompletionMode(QtWidgets.QCompleter.PopupCompletion)
            completer.setFilterMode(QtCore.Qt.MatchContains)
        else:
            raise ValueError(f"Unsupported completion: {completion}")
        completer.setModel(self.label_list.model())
        self.edit.setCompleter(completer)

    # 定义两个增删函数来控制我们的逻辑边表格
    def _add_edge_row(self, target_id="", relation=""):
        row = self.edges_table.rowCount()
        self.edges_table.insertRow(row)

        # 目标ID输入框
        item_target = QtWidgets.QTableWidgetItem(str(target_id) if target_id else "")
        self.edges_table.setItem(row, 0, item_target)

        # 关系类型下拉框
        combo = QtWidgets.QComboBox()
        combo.addItems(
            [
                "READS_AFTER",
                "ANNOTATES",
                "INSERTS_AT",
                "REPLACES",
                "OVERLAPS",
                "REPRESENTS",
            ]
        )
        if relation:
            combo.setCurrentText(relation)
        self.edges_table.setCellWidget(row, 1, combo)

        # 删除按钮
        btn_delete = QtWidgets.QPushButton("删除")
        btn_delete.clicked.connect(
            lambda checked=None, b=btn_delete: self._delete_edge_row(b)
        )
        self.edges_table.setCellWidget(row, 2, btn_delete)

    def _delete_edge_row(self, button):
        for row in range(self.edges_table.rowCount()):
            if self.edges_table.cellWidget(row, 2) is button:
                self.edges_table.removeRow(row)
                return

    def _clear_edges_table(self):
        # 关闭所有活跃的持久编辑器，防止 cell editor 在被清空时残留导致崩溃
        for row in range(self.edges_table.rowCount()):
            for col in range(self.edges_table.columnCount()):
                self.edges_table.closePersistentEditor(
                    self.edges_table.item(row, col)
                )
        self.edges_table.setRowCount(0)

    def add_label_history(self, label: str) -> None:
        if self.label_list.findItems(label, QtCore.Qt.MatchExactly):
            return
        self.label_list.addItem(label)
        if self._sort_labels:
            self.label_list.sortItems()

    def _on_label_selected(self, item: QtWidgets.QListWidgetItem) -> None:
        self.edit.setText(item.text())

    def _validate(self) -> None:
        if not self.edit.isEnabled():
            self.accept()
            return

        if self.edit.text().strip():
            self.accept()

    def _on_label_double_clicked(self, _: QtWidgets.QListWidgetItem) -> None:
        self._validate()

    def _on_editing_finished(self) -> None:
        self.edit.setText(self.edit.text().strip())

    def _on_text_changed(self, label_new: str) -> None:
        # keep state of shared flags
        flags_old = self._current_flags()

        flags_new = {}
        for pattern, keys in self._flags.items():
            if re.match(pattern, label_new):
                for key in keys:
                    flags_new[key] = flags_old.get(key, False)
        self._set_flags(flags_new)

    def _delete_flags(self) -> None:
        while self._flags_layout.count() > 0:
            widget = self._flags_layout.takeAt(0).widget()
            if widget is not None:
                widget.setParent(QtWidgets.QWidget())

    def _reset_flags(self, label: str = "") -> None:
        flags = {}
        for pattern, keys in self._flags.items():
            if re.match(pattern, label):
                for key in keys:
                    flags[key] = False
        self._set_flags(flags)

    def _set_flags(self, flags: dict[str, bool]) -> None:
        self._delete_flags()
        for key in flags:
            item = QtWidgets.QCheckBox(key, self)
            item.setChecked(flags[key])
            self._flags_layout.addWidget(item)
            item.show()

    def _current_flags(self) -> dict[str, bool]:
        return {
            cb.text(): cb.isChecked()
            for i in range(self._flags_layout.count())
            if (cb := cast(QtWidgets.QCheckBox, self._flags_layout.itemAt(i).widget()))
        }

    def _current_group_id(self) -> int | None:
        group_id = self.edit_group_id.text()
        if group_id:
            return int(group_id)
        return None

    def _restore_or_reset_flags(self, text: str, flags: dict[str, bool] | None) -> None:
        if flags:
            self._set_flags(flags)
        else:
            self._reset_flags(text)

    def popup(
        self,
        text: str | None = None,
        move: bool = True,
        flags: dict[str, bool] | None = None,
        group_id: int | None = None,
        description: str | None = None,
        flags_disabled: bool = False,
        # 增加我们需要的参数
        node_id: str = "",
        transcription_raw: str = "",
        transcription_semantic: str = "",
        attributes: dict[str, Any] | None = None,
        edges: list[dict[str, str]] | None = None,
    ) -> (
        tuple[
            str,
            dict[str, bool],
            int | None,
            str,
            str,
            str,
            str,
            dict[str, Any],
            list[dict[str, str]],
        ]
        | tuple[None, None, None, None, None, None, None, None, None]
    ):
        if self._fit_to_content["row"]:
            self.label_list.setMinimumHeight(
                self.label_list.sizeHintForRow(0) * self.label_list.count() + 2
            )
        if self._fit_to_content["column"]:
            self.label_list.setMinimumWidth(self.label_list.sizeHintForColumn(0) + 2)
        # if text is None, the previous label in self.edit is kept
        if text is None:
            text = self.edit.text()
        # description is always initialized by empty text c.f., self.edit.text
        if description is None:
            description = ""

        self.edit_description.setPlainText(description)
        self._restore_or_reset_flags(text, flags)
        if flags_disabled:
            for i in range(self._flags_layout.count()):
                self._flags_layout.itemAt(i).widget().setDisabled(True)
        self.edit.setText(text)
        self.edit.setSelection(0, len(text))
        if group_id is None:
            self.edit_group_id.clear()
        else:
            self.edit_group_id.setText(str(group_id))
        # 恢复增加的属性到UI控件(状态回显)
        self.edit_node_id.setText(str(node_id) if node_id is not None else "")
        self.edit_transcription_raw.setPlainText(
            str(transcription_raw) if transcription_raw is not None else ""
        )
        self.edit_transcription_semantic.setPlainText(
            str(transcription_semantic) if transcription_semantic is not None else ""
        )
        if attributes:
            # 恢复 Z-Index
            z_idx = attributes.get("z_index", 0)
            try:  # 转为int类型
                self.combo_z_index.setCurrentIndex(
                    int(z_idx) if z_idx is not None else 0
                )
            except ValueError:
                self.combo_z_index.setCurrentIndex(0)

            # 恢复 Color
            c_val = attributes.get("color", "black")
            c_idx = self.combo_color.findText(str(c_val))
            if c_idx >= 0:
                self.combo_color.setCurrentIndex(c_idx)

            # 恢复 Vague
            self.check_vague.setChecked(attributes.get("vague", False))

            # 恢复 Reading Direction
            rd_val = attributes.get("reading_direction", "RTL")
            rd_idx = self.combo_reading_direction.findText(str(rd_val))
            if rd_idx >= 0:
                self.combo_reading_direction.setCurrentIndex(rd_idx)

            # 恢复 Handwriting Style
            self.edit_handwriting_style.setText(
                attributes.get("handwriting_style", "")
            )
        else:
            # 如果是新建的框，重置下拉菜单，防止残留上一个框的属性
            self.combo_z_index.setCurrentIndex(0)
            self.check_vague.setChecked(False)
            self.combo_reading_direction.setCurrentIndex(0)
            self.edit_handwriting_style.clear()

        # 清空并遍历加载所有的边
        self._clear_edges_table()
        if edges:
            for edge in edges:
                self._add_edge_row(edge.get("target", ""), edge.get("relation", ""))
        else:
            self.edit_target_id.clear()
            self.combo_relation.setCurrentIndex(0)

        # 列表匹配定位
        items = self.label_list.findItems(text, QtCore.Qt.MatchFixedString)
        if items:
            if len(items) != 1:
                logger.warning(f"Label list has duplicate '{text}'")
            self.label_list.setCurrentItem(items[0])
            row = self.label_list.row(items[0])
            # self.edit.completer().setCurrentRow(row)
        # NOTE: 不在此处强制 setFocus 到 QComboBox，避免与 edges_table 的 cell editor
        # 争夺焦点导致"无法输入→卡死→闪退"。改为让 Qt 根据用户点击自行分发焦点。
        # self.edit.setFocus(QtCore.Qt.PopupFocusReason)
        if move:
            self.move(QtGui.QCursor.pos())

        # 弹窗阻塞等待用户操作
        if self.exec_():
            # 用户点击 OK，打包返回收集到的所有数据

            # 提取图层和颜色组装 attributes
            z_idx = self.combo_z_index.currentIndex()
            c_val = self.combo_color.currentText()
            out_attributes = {
                "z_index": z_idx,
                "color": c_val,
                "vague": self.check_vague.isChecked(),
                "reading_direction": self.combo_reading_direction.currentText(),
                "handwriting_style": self.edit_handwriting_style.text().strip(),
            }

            # 遍历表格 提取逻辑边组装 edges
            out_edges = []
            for row in range(self.edges_table.rowCount()):
                target_item = self.edges_table.item(row, 0)
                relation_widget = self.edges_table.cellWidget(row, 1)

                target_id = target_item.text().strip() if target_item else ""
                relation = relation_widget.currentText() if relation_widget else ""

                if target_id and relation:
                    out_edges.append({"target": target_id, "relation": relation})

            # 返回包括我们额外元素的元组
            return (
                self.edit.text(),  # 0: label / type
                self._current_flags(),  # 1: flags
                self._current_group_id(),  # 2: group_id
                self.edit_description.toPlainText(),  # 3: description
                self.edit_node_id.text().strip(),  # 4: node_id
                self.edit_transcription_raw.toPlainText().strip(),
                # 5: transcription_raw
                self.edit_transcription_semantic.toPlainText().strip(),
                # 6: transcription_semantic
                out_attributes,  # 7: attributes
                out_edges,  # 8: edges
            )
        else:
            # 用户点击取消，返回同样长度的全 None 元组
            return None, None, None, None, None, None, None, None, None
