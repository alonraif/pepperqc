#ifndef BarchartConditionInput_H
#define BarchartConditionInput_H

#include <QCompleter>
#include <QPushButton>
#include <QTimer>
#include <QWidget>
#include "Plot.h"

namespace Ui {
class BarchartConditionInput;
}

class BarchartConditionInput : public QWidget
{
    Q_OBJECT

public:
    explicit BarchartConditionInput(QWidget *parent = 0);
    ~BarchartConditionInput();

    void setColor(const QColor& color);
    QColor getColor() const;

    void setRemoveButtonEnabled(bool value);

    void setName(const QString& name);
    QString getName() const;

    void setEliminateSpikes(bool eliminateSpikes);
    bool getEliminateSpikes() const;

    void setCondition(const QString& value);
    QString getCondition() const;

    void setJsEngine(QJSEngine* engine);
    QJSEngine* getJsEngine() const;

    void setCompleter(QCompleter* completer);
    QCompleter* getCompleter() const;

    QString getTooltipHelp() const;
Q_SIGNALS:
    void addButtonClicked();
    void removeButtonClicked();

private Q_SLOTS:
    void on_remove_toolButton_clicked();

    void on_add_toolButton_clicked();

    void on_color_toolButton_clicked();

    void on_condition_lineEdit_textEdited(const QString &arg1);

    void on_condition_lineEdit_editingFinished();

    void on_condition_lineEdit_cursorPositionChanged(int arg1, int arg2);

private:
    QColor m_color;
    Ui::BarchartConditionInput *ui;

    QTimer m_validationTimer;
    QJSEngine* m_engine;

    QColor m_defaultTextColor;
    QColor m_validatedTextColor;
    QColor m_errorTextColor;
    QList<QPair<QString, QString>> m_autocompletion;
};

#endif // BarchartConditionInput_H
